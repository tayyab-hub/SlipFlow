# Backup and recovery

## Locations and retention

The live database is `%APPDATA%\StitchFlow\stitchflow.db`. Backups are under `%APPDATA%\StitchFlow\backups`. The legacy folder is deliberate and preserves existing StitchFlow installations.

Manual, automatic and recovery files have `slipflow-manual-`, `slipflow-auto-` and `slipflow-recovery-` prefixes. Automatic retention removes only matching automatic snapshots beyond the configured count. Manual/recovery snapshots remain until the owner removes them. Copy important backups to a separate physical drive; same-disk copies do not protect against disk failure.

## How snapshots work

SlipFlow uses SQLite `VACUUM INTO` to capture a consistent database including committed WAL contents. It then checks SQLite integrity, foreign keys and supported schema. Do not copy only the live `.db` file while the application is running: recent committed changes may still be in its WAL.

Automatic checks occur once a minute while the app is running and create a snapshot after the configured interval. They are not a background Windows service. A failure is stored and shown in Settings. A successful automatic or manual snapshot clears the error.

## Normal restoration

1. Stop operator work and confirm which snapshot is required.
2. In Settings, select **Restore** beside a backup, or **Restore from file** for an external copy.
3. Read the native confirmation. Restoration replaces current data with the selected snapshot; newer changes will disappear from the active view.
4. SlipFlow verifies and stages a copy, migrates the staged copy if necessary, creates a recovery snapshot of current data, then closes and replaces the live database.
5. The replacement is reopened. If replacement fails, the prior database is restored and reopened. The chosen source file is not modified.
6. Verify the factory settings, latest batches and totals. The success message names the recovery snapshot, which can restore the pre-restore state.

Backups with corrupt data, broken relationships, unsupported future schema or unexpected triggers/views are refused. Restore only trusted SlipFlow snapshots. This validation is not a general malware scanner.

## If the app cannot open its database

1. Close SlipFlow completely. Preserve the entire `StitchFlow` folder, including `.db`, `-wal`, `-shm` and backups, in a dated recovery folder. Do not delete the original evidence.
2. Obtain a known-good verified backup. If there is no good backup, stop and seek database recovery assistance rather than overwriting the remaining data.
3. With the app closed, rename the damaged `StitchFlow` folder to preserve it. Launch SlipFlow to create a fresh empty database in the usual location.
4. Use **Settings → Restore from file** to restore the trusted backup from the preserved or external folder. Validate expected batch totals before resuming production.
5. Keep the preserved folder until recovery has been independently confirmed.

Before any upgrade, create and copy a verified snapshot. Uninstalling the application deliberately retains data; it is not a data-erasure procedure. SlipFlow does not encrypt backup files, so restrict access and use protected storage for real factory data.
