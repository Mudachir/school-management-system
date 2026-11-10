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
even after ExpiresAt elapses until a later milestone explicitly changes its
status. Expired and cancelled history may coexist with a new active application.
Class-name trimming is handled by M3 class creation. Read APIs derive effective
seat counts without updating history. Capacity enforcement, transaction/row-lock
services, status transitions, and expiration workers remain deferred. No cached
seat counters exist.

See [backend/README.md](../backend/README.md) for local commands and API behavior.
