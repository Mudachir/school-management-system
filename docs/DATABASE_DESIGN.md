# M2 database foundation

The modular monolith keeps domain types, EF mappings, and migrations inside
`SchoolAdmission.Api`. There are exactly two application tables, plus EF's
`__EFMigrationsHistory` metadata. There is no Students table: `StudentId` is the
birth-registration number itself, stored as text so leading zeroes survive.

PostgreSQL identifiers use quoted PascalCase names in the `public` schema.

| Table | Columns |
| --- | --- |
| `"AdmissionClasses"` | `"Id"` uuid PK; `"Name"` varchar(150) NOT NULL; `"TotalSeats"` integer NOT NULL; `"CreatedAt"` timestamptz NOT NULL |
| `"AdmissionHolds"` | `"Id"` uuid PK; `"ClassId"` uuid NOT NULL FK; `"StudentId"` varchar(17) NOT NULL; `"Status"` varchar(20) NOT NULL; `"CreatedAt"`, `"ExpiresAt"` timestamptz NOT NULL; `"ConfirmedAt"`, `"CancelledAt"` nullable timestamptz |

IDs use `Guid.CreateVersion7()` in .NET, with EF value generation disabled and no
database UUID default. UTC `DateTime` values map to PostgreSQL timestamptz.
`HoldStatus` maps explicitly to uppercase strings: HELD, CONFIRMED, EXPIRED,
CANCELLED. There is no native PostgreSQL enum or status lookup table.

| Constraint/index | Definition |
| --- | --- |
| `PK_AdmissionClasses`, `PK_AdmissionHolds` | Primary key on `"Id"` of the corresponding table |
| `CK_AdmissionClasses_TotalSeats` | `"TotalSeats" > 0` |
| `CK_AdmissionHolds_StudentId` | `"StudentId" ~ '^[0-9]{17}$'` (exactly 17 ASCII digits) |
| `CK_AdmissionHolds_Status` | `"Status" IN ('HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED')` |
| `FK_AdmissionHolds_AdmissionClasses_ClassId` | `"ClassId"` references `"AdmissionClasses"("Id")` ON DELETE RESTRICT |
| `UX_AdmissionClasses_Name_Lower` | Unique expression index on `lower("Name")` |
| `UX_AdmissionHolds_StudentId_ClassId_Active` | Unique `("StudentId", "ClassId")` WHERE `"Status" IN ('HELD', 'CONFIRMED')` |
| `IX_AdmissionHolds_Status_ExpiresAt` | `("Status", "ExpiresAt")` |
| `IX_AdmissionHolds_StudentId_CreatedAt` | `("StudentId", "CreatedAt" DESC)` |
| `IX_AdmissionHolds_ClassId` | `("ClassId")`, supporting the FK |

The name expression index is hand-authored SQL in the initial EF migration
because EF's standard index mapping cannot express `lower("Name")`. Its removal
is covered by dropping AdmissionClasses in the migration's Down method. Keep it
in mind when changing Name or renaming the table in future migrations.

No time expression appears in the partial index. A HELD record remains protected
even after ExpiresAt elapses until its status changes. M4 hold creation normalizes
the requesting student's HELD rows with ExpiresAt <= the decision timestamp to
EXPIRED inside the allocation transaction, before inserting a replacement. It
preserves their IDs, timestamps, and history. Other students' elapsed HELD rows
remain unchanged and do not count against capacity. Expired and cancelled history
may coexist with a new active application; CONFIRMED records are never expired.

Allocation uses a READ COMMITTED PostgreSQL transaction and parameterized
`SELECT ... FOR UPDATE` on the target AdmissionClasses row. The decision timestamp
is captured after lock acquisition, so subsequent statements see committed holds
from earlier allocations. All allocations for the same class take this row lock
before checking duplicates/capacity. Failure rolls back normalization and inserts;
success commits before its HTTP response. Different classes have independent row
locks. The partial unique index remains an additional duplicate safeguard, and
the existing schema/migration is unchanged.

Class-name trimming is handled by M3 class creation. Read APIs derive effective
seat counts without updating history. Confirmation, cancellation, and background
expiration remain deferred. No cached seat counters exist.

See [backend/README.md](../backend/README.md) for local commands and API behavior.
