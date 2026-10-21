import Modal from './Modal.jsx'
import Button from './Button.jsx'

/*
    The Terms of Use and Privacy Policy a customer agrees to on sign-up.
    `section` picks which one opens first; both are always shown so the
    customer reads the whole agreement in one place.
*/

const TERMS = [
  {
    heading: 'Your account',
    body: 'You must give accurate details when you register. Your phone number and password are your sign-in; keep them private. You are responsible for every order placed from your account. BUeño accounts must belong to a current or former Bicol University student, alumnus, or faculty member.',
  },
  {
    heading: 'Orders and payment',
    body: 'Prices are shown in Philippine pesos and may change before you check out. An order is confirmed only once Tindahan ni Isko accepts it. Unpaid orders, and orders not claimed within their pickup window, may be cancelled.',
  },
  {
    heading: 'Pre-orders',
    body: 'Pre-order items are produced after you order them, so their release date is an estimate. Pre-orders must be paid in full, delivery fee included, before they are processed.',
  },
  {
    heading: 'Pickup, delivery and appointments',
    body: 'Pickup orders are claimed at the store during your booked slot. Delivery orders are sent to the address on your account. Please arrive on time for appointments; a missed slot may need to be rebooked.',
  },
  {
    heading: 'Returns and replacements',
    body: 'Items with manufacturing defects or sizing issues may be replaced within 7 days of receipt. Items must be unused and returned with proof of purchase.',
  },
  {
    heading: 'Acceptable use',
    body: 'Do not misuse the store: no false orders, abusive reviews, or attempts to access other accounts. Accounts that break these terms may be suspended.',
  },
]

const PRIVACY = [
  {
    heading: 'What we collect',
    body: 'Your name, phone number, email, address, university affiliation (for BUeño accounts), order history, appointments, and the reviews you post.',
  },
  {
    heading: 'Why we collect it',
    body: 'To create your account, process and deliver your orders, send verification codes and order updates, and run the store. We do not sell your data or use it for third-party advertising.',
  },
  {
    heading: 'Who can see it',
    body: 'Only authorised Tindahan ni Isko staff, and the payment and delivery services needed to complete your order.',
  },
  {
    heading: 'Your rights',
    body: 'Under the Data Privacy Act of 2012 (RA 10173), you may ask to access, correct, or delete your personal data. Contact the store to make a request.',
  },
]

function Section({ id, title, items }) {
  return (
    <section id={id} className="space-y-3">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      {items.map((item) => (
        <div key={item.heading}>
          <p className="text-xs font-semibold text-gray-800">{item.heading}</p>
          <p className="text-xs leading-relaxed text-gray-500 mt-0.5">{item.body}</p>
        </div>
      ))}
    </section>
  )
}

export default function TermsModal({ isOpen, onClose, onAgree }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Terms and Privacy Policy"
      subtitle="Tindahan ni Isko · Bicol University"
      size="wide"
      bodyClassName="max-h-[60vh] overflow-y-auto space-y-6"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {onAgree && (
            <Button variant="primary" onClick={onAgree}>
              I Agree
            </Button>
          )}
        </>
      }
    >
      <Section id="terms-of-use" title="Terms of Use" items={TERMS} />
      <Section id="privacy-policy" title="Privacy Policy" items={PRIVACY} />
    </Modal>
  )
}
