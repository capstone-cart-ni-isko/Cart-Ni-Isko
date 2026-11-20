import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { TERMS, PRIVACY } from '../../data/storePolicies.js'

/*
    The Terms of Use and Privacy Policy a customer agrees to on sign-up.
    `section` picks which one opens first; both are always shown so the
    customer reads the whole agreement in one place.
*/

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
