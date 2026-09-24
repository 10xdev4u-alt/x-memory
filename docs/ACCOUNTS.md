# Account-scoped local data

Runtime database calls use the current account ID and open `x-memory-<accountId>`. The active account is stored in extension local storage, and every account receives a separate corpus, metrics, and deletion boundary.

## Migration

The legacy `x-memory` database is not merged automatically. Existing users should export a backup before selecting an account, then import it into the account-scoped database and verify the records. The legacy database remains untouched until that verification is complete.

## Logout and deletion

Changing the current account closes future operations to the new account scope; it does not delete the previous account corpus. The local wipe action deletes all local databases and extension storage after the user invokes it.
