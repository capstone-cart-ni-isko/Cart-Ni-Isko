export const mockUser = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  fullName: 'Juan Dela Cruz',
  email: 'jdc2026-1234-5678@bicol-u.edu.ph',
  phone: '+63 912 345 6789',
  username: 'juandc',
  yearLevel: '1st Year Student',
  campus: 'Main Campus',
  college: 'College of Engineering',
  course: 'Mechanical Engineering',
  bio: '',
  avatar: null,
}

export const mockAppointments = [
  { id: 1, type: 'Visit Store', time: '10:30 AM - 11:00 AM' },
  { id: 2, type: 'Pick-up Order', time: '10:30 AM - 11:00 AM' },
]

export const mockOrderStatuses = [
  { id: 'process', label: 'To Process', icon: 'box' },
  { id: 'receive', label: 'To Receive or Claim', icon: 'hand-box' },
  { id: 'review', label: 'To Review', icon: 'star-box' },
]

export const helpCategories = [
  'Orders & Delivery',
  'Payments & Refunds',
  'Account & Profile',
  'Appointments',
  'Store Locations',
  'Contact Support',
]
