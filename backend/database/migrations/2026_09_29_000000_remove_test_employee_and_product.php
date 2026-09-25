<?php

use App\Models\Employee;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Soft-delete leftover test data from production.
 *
 * Employee: superadmin@store.com — named "Super Admin" but typed STAFF, so it
 *   showed up as a "Student Officer". Its active sessions are revoked too,
 *   matching AccountsAPI's disable flow.
 * Product:  SKU-MUFXZMJG ("Test", Hoodies) — created locally, image points
 *   at 127.0.0.1.
 *
 * Soft-deleted (emp_deleted / prod_deleted) like the app's own remove
 * actions, so both can be restored. Idempotent.
 */
return new class extends Migration
{
    private const TEST_EMPLOYEE = 'superadmin@store.com';
    private const TEST_PRODUCT = 'SKU-MUFXZMJG';

    public function up(): void
    {
        $now = now();

        $empIds = DB::table('employee')
            ->where('emp_email', self::TEST_EMPLOYEE)
            ->whereNull('emp_deleted')
            ->pluck('emp_id');

        if ($empIds->isNotEmpty()) {
            DB::table('employee')->whereIn('emp_id', $empIds)->update(['emp_deleted' => $now]);

            DB::table('personal_access_tokens')
                ->where('tokenable_type', (new Employee)->getMorphClass())
                ->whereIn('tokenable_id', $empIds)
                ->delete();
        }

        DB::table('product')
            ->where('prod_tag', self::TEST_PRODUCT)
            ->whereNull('prod_deleted')
            ->update(['prod_deleted' => $now]);
    }

    public function down(): void
    {
        DB::table('employee')->where('emp_email', self::TEST_EMPLOYEE)->update(['emp_deleted' => null]);
        DB::table('product')->where('prod_tag', self::TEST_PRODUCT)->update(['prod_deleted' => null]);
    }
};
