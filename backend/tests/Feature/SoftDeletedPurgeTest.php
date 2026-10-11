<?php

namespace Tests\Feature;

use App\Http\Controllers\DatabaseAPI;
use App\Models\Customer;
use App\Support\IdAllocator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * SYSTEM RULE 78 - "Soft-deleted records must be hard-deleted from the
 * database after 18 months."
 *
 * The purge is the one place in the system allowed to remove a row outright,
 * so every half of it is pinned down here: the cutoff, the records that must
 * survive it (recent ones and records something still points at), and the
 * guarantee that an ordinary, live record is never a candidate at all.
 */
class SoftDeletedPurgeTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    // ==========================================
    // FIXTURES
    // ==========================================

    /** Same shape every other feature test signs a customer up with. */
    private function makeCustomer(array $attributes = []): Customer
    {
        $this->seq++;

        return Customer::create(array_merge([
            'cust_created'  => now(),
            'cust_password' => Hash::make('Password123!'),
            'cust_nickname' => 'Purger' . $this->seq,
            'cust_pronoun'  => 'they/them',
            'cust_birthday' => '2001-01-01',
            'cust_brgy'     => 'Sagpon',
            'cust_city'     => 'Legazpi',
            'cust_province' => 'Albay',
            'cust_country'  => '',
            'cust_callcode' => '+63',
            'cust_phone'    => '09' . str_pad((string) (800000000 + $this->seq), 9, '0', STR_PAD_LEFT),
            'cust_email'    => 'purge' . $this->seq . uniqid() . '@example.com',
            'cust_type'     => 'Student',
            'cust_college'  => 'BUCE',
            'cust_wishlist' => 0,
            'cust_cart'     => 0,
            'cust_orders'   => 0,
            'cust_appoints' => 0,
        ], $attributes));
    }

    /** Marks a row as soft-deleted at a given age, the way a deactivation does. */
    private function softDelete(Customer $customer, int $monthsAgo): Customer
    {
        $customer->forceFill(['cust_deleted' => now()->subMonths($monthsAgo)])->save();

        return $customer->refresh();
    }

    /** One immutable audit row pointing at a customer (custlog is never edited). */
    private function auditRowFor(Customer $customer): void
    {
        DB::table('custlog')->insert([
            'custlog_id'       => IdAllocator::next('custlog', 'custlog_id'),
            'cust_id'          => $customer->cust_id,
            'custlog_access'   => 'auth',
            'custlog_endpoint' => 'POST /api/auth/cust_logout',
            'custlog_created'  => now(),
        ]);
    }

    /** One order in a given status, placed $monthsAgo months ago. */
    private function makeOrder(Customer $customer, string $status, int $monthsAgo): int
    {
        return DB::table('orders')->insertGetId([
            'cust_id'      => $customer->cust_id,
            'ord_amount'   => 100,
            'ord_status'   => $status,
            'ord_claiming' => 'delivery',
            'ord_created'  => now()->subMonths($monthsAgo),
        ], 'ord_id');
    }

    /** The delivery dispatch checkout spawns for a delivery-type order. */
    private function makeDispatch(int $ordId, Customer $customer, int $monthsAgo): array
    {
        $deliverId = DB::table('delivery')->insertGetId([
            'ord_id'          => $ordId,
            'cust_id'         => $customer->cust_id,
            'deliver_address' => 'Sagpon, Legazpi',
            'deliver_qr'      => 'QR-TEST' . $ordId,
            'deliver_created' => now()->subMonths($monthsAgo),
        ], 'deliver_id');

        DB::table('parcel')->insert([
            'ord_id'          => $ordId,
            'deliver_id'      => $deliverId,
            'pay_id'          => 1,
            'parcel_created'  => now()->subMonths($monthsAgo),
        ]);

        return [$deliverId, DB::table('parcel')->where('ord_id', $ordId)->value('parcel_id')];
    }

    /** The pickup link checkout spawns for a pickup-type order. */
    private function makePickup(int $ordId, ?int $appointId, int $monthsAgo): int
    {
        return DB::table('pickup')->insertGetId([
            'appoint_id'    => $appointId,
            'ord_id'        => $ordId,
            'pickup_created' => now()->subMonths($monthsAgo),
        ], 'pickup_id');
    }

    /** One appointment in a given status, closed $monthsAgo months ago. */
    private function makeAppointment(Customer $customer, string $status, int $monthsAgo): int
    {
        return DB::table('appointments')->insertGetId([
            'cust_id'         => $customer->cust_id,
            'appoint_type'    => 'VISIT',
            'appoint_status'  => $status,
            'appoint_created' => now()->subMonths($monthsAgo),
            'appoint_closed'  => now()->subMonths($monthsAgo),
        ], 'appoint_id');
    }

    // ==========================================
    // RULE 78
    // ==========================================

    public function test_a_record_soft_deleted_past_the_eighteen_month_cutoff_is_hard_deleted()
    {
        $ancient = $this->softDelete($this->makeCustomer(), 19);

        $counts = DatabaseAPI::purgeSoftDeleted();

        $this->assertSame(1, $counts['customer'] ?? 0);
        $this->assertNull(Customer::find($ancient->cust_id), 'The expired record must be gone for good.');
    }

    public function test_a_record_soft_deleted_inside_the_cutoff_still_exists()
    {
        $recent = $this->softDelete($this->makeCustomer(), 17);

        $counts = DatabaseAPI::purgeSoftDeleted();

        $this->assertArrayNotHasKey('customer', $counts);
        $this->assertNotNull(Customer::find($recent->cust_id), 'Eighteen months is a boundary, not an approximation.');
    }

    public function test_a_soft_deleted_record_something_still_points_at_is_held_back()
    {
        $referenced = $this->softDelete($this->makeCustomer(), 24);
        $this->auditRowFor($referenced);

        $orphan = $this->softDelete($this->makeCustomer(), 24);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // Integrity (ISO 25010) outranks the cleanup: the row the access log
        // still cites survives, the one nobody references does not.
        $this->assertSame(1, $counts['customer'] ?? 0);
        $this->assertNotNull(Customer::find($referenced->cust_id));
        $this->assertNull(Customer::find($orphan->cust_id));
    }

    public function test_an_active_record_is_never_a_candidate()
    {
        $active = $this->makeCustomer();

        $counts = DatabaseAPI::purgeSoftDeleted();

        $this->assertSame([], $counts, 'Nothing was soft-deleted, so nothing may be removed.');
        $this->assertNotNull(Customer::find($active->cust_id));
    }

    public function test_the_purge_is_idempotent_and_only_moves_the_cutoff_forward()
    {
        $this->softDelete($this->makeCustomer(), 19);

        $first  = DatabaseAPI::purgeSoftDeleted();
        $second = DatabaseAPI::purgeSoftDeleted();

        $this->assertSame(1, $first['customer'] ?? 0);
        $this->assertSame([], $second, 'A second run over the same data finds nothing left to do.');
    }

    // ==========================================
    // TERMINAL ORDERS (cancelled / unclaimed)
    // ==========================================

    public function test_a_cancelled_order_past_the_cutoff_is_purged_with_its_whole_dispatch()
    {
        $customer = $this->makeCustomer();
        $ordId    = $this->makeOrder($customer, 'cancelled', 19);

        DB::table('items')->insert(['ord_id' => $ordId, 'item_created' => now()->subMonths(19)]);
        [$deliverId, $parcelId] = $this->makeDispatch($ordId, $customer, 19);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // A terminal order is dead by definition, so its own rows leave with
        // it instead of holding it back forever.
        $this->assertSame(1, $counts['orders'] ?? 0);
        $this->assertSame(1, $counts['items'] ?? 0);
        $this->assertSame(1, $counts['delivery'] ?? 0);
        $this->assertSame(1, $counts['parcel'] ?? 0);
        $this->assertDatabaseMissing('orders', ['ord_id' => $ordId]);
        $this->assertDatabaseMissing('items', ['ord_id' => $ordId]);
        $this->assertDatabaseMissing('delivery', ['deliver_id' => $deliverId]);
        $this->assertDatabaseMissing('parcel', ['parcel_id' => $parcelId]);
    }

    public function test_an_unclaimed_order_past_the_cutoff_takes_its_pickup_and_absent_appointment()
    {
        $customer   = $this->makeCustomer();
        $ordId      = $this->makeOrder($customer, 'unclaimed', 19);
        $appointId  = $this->makeAppointment($customer, 'absent', 19);
        $pickupId   = $this->makePickup($ordId, $appointId, 19);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // 'unclaimed' is FLOW-ORD_CLAIM-06's absent order; its pickup link
        // dies with it, which is what lets the absent appointment go too.
        $this->assertSame(1, $counts['orders'] ?? 0);
        $this->assertSame(1, $counts['pickup'] ?? 0);
        $this->assertSame(1, $counts['appointments'] ?? 0);
        $this->assertDatabaseMissing('pickup', ['pickup_id' => $pickupId]);
        $this->assertDatabaseMissing('appointments', ['appoint_id' => $appointId]);
    }

    public function test_an_order_inside_the_cutoff_or_still_live_keeps_every_row()
    {
        $customer   = $this->makeCustomer();
        $recent     = $this->makeOrder($customer, 'cancelled', 17);
        $this->makeDispatch($recent, $customer, 17);
        $processing = $this->makeOrder($customer, 'processing', 24);
        DB::table('items')->insert(['ord_id' => $processing, 'item_created' => now()]);

        DatabaseAPI::purgeSoftDeleted();

        $this->assertDatabaseHas('orders', ['ord_id' => $recent]);
        $this->assertDatabaseHas('delivery', ['ord_id' => $recent]);
        $this->assertDatabaseHas('parcel', ['ord_id' => $recent]);
        $this->assertDatabaseHas('orders', ['ord_id' => $processing]);
        $this->assertDatabaseHas('items', ['ord_id' => $processing]);
    }

    // ==========================================
    // TERMINAL APPOINTMENTS (cancelled / absent)
    // ==========================================

    public function test_a_cancelled_or_absent_appointment_past_the_cutoff_is_purged()
    {
        $customer = $this->makeCustomer();
        $absent   = $this->makeAppointment($customer, 'absent', 19);
        $cancelled = $this->makeAppointment($customer, 'cancelled', 19);
        $upcoming = $this->makeAppointment($customer, 'upcoming', 24);
        $done     = $this->makeAppointment($customer, 'done', 24);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // 'done' is a finished appointment, not a retired one - only
        // cancelled and absent are ever removed.
        $this->assertSame(2, $counts['appointments'] ?? 0);
        $this->assertDatabaseMissing('appointments', ['appoint_id' => $absent]);
        $this->assertDatabaseMissing('appointments', ['appoint_id' => $cancelled]);
        $this->assertDatabaseHas('appointments', ['appoint_id' => $upcoming]);
        $this->assertDatabaseHas('appointments', ['appoint_id' => $done]);
    }

    // ==========================================
    // READ NOTIFICATIONS
    // ==========================================

    public function test_a_read_notification_past_the_cutoff_is_purged_while_an_unread_one_survives()
    {
        $customer = $this->makeCustomer();

        DB::table('custnotif')->insert([
            ['cust_id' => $customer->cust_id, 'custnotif_msg' => 'old read', 'custnotif_created' => now()->subMonths(20), 'custnotif_read' => now()->subMonths(19)],
            ['cust_id' => $customer->cust_id, 'custnotif_msg' => 'old unread', 'custnotif_created' => now()->subMonths(20), 'custnotif_read' => null],
            ['cust_id' => $customer->cust_id, 'custnotif_msg' => 'recent read', 'custnotif_created' => now()->subMonths(1), 'custnotif_read' => now()->subMonths(1)],
        ]);

        DB::table('empnotif')->insert([
            ['emp_id' => 1, 'empnotif_msg' => 'old read', 'empnotif_created' => now()->subMonths(20), 'empnotif_read' => now()->subMonths(19)],
            ['emp_id' => 1, 'empnotif_msg' => 'old unread', 'empnotif_created' => now()->subMonths(20), 'empnotif_read' => null],
        ]);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // Only what was READ long ago is retired; the unread inbox and the
        // recently read row are the live state of the account.
        $this->assertSame(1, $counts['custnotif'] ?? 0);
        $this->assertSame(1, $counts['empnotif'] ?? 0);
        $this->assertTrue(DB::table('custnotif')->where('custnotif_msg', 'old unread')->exists());
        $this->assertTrue(DB::table('custnotif')->where('custnotif_msg', 'recent read')->exists());
        $this->assertFalse(DB::table('custnotif')->where('custnotif_msg', 'old read')->exists());
    }

    // ==========================================
    // REVIEW TOMBSTONES ([DELETED] / [REJECTED])
    // ==========================================

    public function test_a_rejected_or_deleted_review_past_the_cutoff_is_purged()
    {
        $customer = $this->makeCustomer();

        DB::table('reviews')->insert([
            ['cust_id' => $customer->cust_id, 'prod_id' => 1, 'rev_msg' => '[DELETED] old text', 'rev_created' => now()->subMonths(19), 'rev_approved' => null],
            ['cust_id' => $customer->cust_id, 'prod_id' => 1, 'rev_msg' => '[REJECTED] |old text', 'rev_created' => now()->subMonths(19), 'rev_approved' => null],
            ['cust_id' => $customer->cust_id, 'prod_id' => 1, 'rev_msg' => '[DELETED] but was approved', 'rev_created' => now()->subMonths(19), 'rev_approved' => now()->subMonths(20)],
            ['cust_id' => $customer->cust_id, 'prod_id' => 1, 'rev_msg' => '[DELETED] recent', 'rev_created' => now()->subMonths(1), 'rev_approved' => null],
            ['cust_id' => $customer->cust_id, 'prod_id' => 1, 'rev_msg' => 'plain live review', 'rev_created' => now()->subMonths(19), 'rev_approved' => now()->subMonths(19)],
        ]);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // The tombstones that were never approved go; an approved review
        // keeps its record even behind a marker, and a recent tombstone is
        // still inside the window.
        $this->assertSame(2, $counts['reviews'] ?? 0);
        $this->assertSame(3, DB::table('reviews')->count());
    }

    // ==========================================
    // COMPLETED DELIVERY / PARCEL
    // ==========================================

    public function test_a_completed_dispatch_past_the_cutoff_is_purged_but_the_order_stays()
    {
        $customer = $this->makeCustomer();
        $ordId    = $this->makeOrder($customer, 'received', 24);
        [$deliverId, $parcelId] = $this->makeDispatch($ordId, $customer, 24);

        DB::table('delivery')->where('deliver_id', $deliverId)
            ->update(['deliver_completed' => now()->subMonths(19)]);
        DB::table('parcel')->where('parcel_id', $parcelId)
            ->update(['parcel_completed' => now()->subMonths(19)]);

        $counts = DatabaseAPI::purgeSoftDeleted();

        // The dispatch proof retires after 18 months; the order itself is
        // money history and is not a terminal-status candidate.
        $this->assertSame(1, $counts['parcel'] ?? 0);
        $this->assertSame(1, $counts['delivery'] ?? 0);
        $this->assertDatabaseMissing('parcel', ['parcel_id' => $parcelId]);
        $this->assertDatabaseMissing('delivery', ['deliver_id' => $deliverId]);
        $this->assertDatabaseHas('orders', ['ord_id' => $ordId]);
    }

    public function test_an_incomplete_dispatch_is_never_a_candidate()
    {
        $customer = $this->makeCustomer();
        $ordId    = $this->makeOrder($customer, 'delivering', 24);
        [$deliverId, $parcelId] = $this->makeDispatch($ordId, $customer, 24);

        DatabaseAPI::purgeSoftDeleted();

        $this->assertDatabaseHas('delivery', ['deliver_id' => $deliverId]);
        $this->assertDatabaseHas('parcel', ['parcel_id' => $parcelId]);
    }
}
