/*
  Store policy copy shared by the sign-up Terms modal, the Size Guide modal
  and the public /help and /terms pages (BUG-03), so the text lives once.
*/

export const TERMS = [
  {
    heading: 'Your account',
    body: 'You must give accurate details when you register. Your phone number and password are your sign-in; keep them private. You are responsible for every order placed from your account. BUeño accounts must belong to a current Bicol University student or faculty member.',
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

export const PRIVACY = [
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

export const SIZE_CHARTS = {
  Hoodies: {
    title: 'BU Hoodies & Sweatshirts',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    inches: [
      { size: 'S', chest: '20"', length: '27"', shoulder: '19"', sleeve: '24"' },
      { size: 'M', chest: '22"', length: '28"', shoulder: '20.5"', sleeve: '25"' },
      { size: 'L', chest: '24"', length: '29"', shoulder: '22"', sleeve: '26"' },
      { size: 'XL', chest: '26"', length: '30"', shoulder: '23.5"', sleeve: '27"' },
      { size: '2XL', chest: '28"', length: '31"', shoulder: '25"', sleeve: '28"' },
    ],
    cm: [
      { size: 'S', chest: '51 cm', length: '68 cm', shoulder: '48 cm', sleeve: '61 cm' },
      { size: 'M', chest: '56 cm', length: '71 cm', shoulder: '52 cm', sleeve: '63 cm' },
      { size: 'L', chest: '61 cm', length: '74 cm', shoulder: '56 cm', sleeve: '66 cm' },
      { size: 'XL', chest: '66 cm', length: '76 cm', shoulder: '60 cm', sleeve: '68 cm' },
      { size: '2XL', chest: '71 cm', length: '79 cm', shoulder: '64 cm', sleeve: '71 cm' },
    ],
  },
  Jackets: {
    title: 'BU Varsity Jackets',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    inches: [
      { size: 'S', chest: '21.5"', length: '26.5"', shoulder: '19.5"', sleeve: '24.5"' },
      { size: 'M', chest: '23.5"', length: '27.5"', shoulder: '21"', sleeve: '25.5"' },
      { size: 'L', chest: '25.5"', length: '28.5"', shoulder: '22.5"', sleeve: '26.5"' },
      { size: 'XL', chest: '27.5"', length: '29.5"', shoulder: '24"', sleeve: '27.5"' },
      { size: '2XL', chest: '29.5"', length: '30.5"', shoulder: '25.5"', sleeve: '28.5"' },
    ],
    cm: [
      { size: 'S', chest: '55 cm', length: '67 cm', shoulder: '49 cm', sleeve: '62 cm' },
      { size: 'M', chest: '60 cm', length: '70 cm', shoulder: '53 cm', sleeve: '65 cm' },
      { size: 'L', chest: '65 cm', length: '72 cm', shoulder: '57 cm', sleeve: '67 cm' },
      { size: 'XL', chest: '70 cm', length: '75 cm', shoulder: '61 cm', sleeve: '70 cm' },
      { size: '2XL', chest: '75 cm', length: '77 cm', shoulder: '65 cm', sleeve: '72 cm' },
    ],
  },
  Shirts: {
    title: 'BU T-Shirts & Polos',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    inches: [
      { size: 'S', chest: '19"', length: '26"', shoulder: '17.5"', sleeve: '8"' },
      { size: 'M', chest: '20.5"', length: '27.5"', shoulder: '18.5"', sleeve: '8.5"' },
      { size: 'L', chest: '22"', length: '29"', shoulder: '20"', sleeve: '9"' },
      { size: 'XL', chest: '23.5"', length: '30.5"', shoulder: '21.5"', sleeve: '9.5"' },
      { size: '2XL', chest: '25"', length: '31.5"', shoulder: '23"', sleeve: '10"' },
    ],
    cm: [
      { size: 'S', chest: '48 cm', length: '66 cm', shoulder: '44 cm', sleeve: '20 cm' },
      { size: 'M', chest: '52 cm', length: '70 cm', shoulder: '47 cm', sleeve: '22 cm' },
      { size: 'L', chest: '56 cm', length: '74 cm', shoulder: '51 cm', sleeve: '23 cm' },
      { size: 'XL', chest: '60 cm', length: '77 cm', shoulder: '55 cm', sleeve: '24 cm' },
      { size: '2XL', chest: '64 cm', length: '80 cm', shoulder: '58 cm', sleeve: '25 cm' },
    ],
  },
}
