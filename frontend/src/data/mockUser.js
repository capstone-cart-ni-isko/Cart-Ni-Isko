export const mockUser = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  fullName: 'Juan Dela Cruz',
  email: 'jdcruz@student.u.edu.ph',
  phone: '+63 912 345 6789',
  username: 'juandc',
  studentId: '2020-1234-5678',
  yearLevel: '1st Year',
  campus: 'Main Campus',
  college: 'College of Engineering',
  course: 'Mechanical Engineering',
  bio: '1st Year Student at the College of Engineering, taking up Mechanical Engineering.',
  avatar: null,
  preferredContact: 'Email',
}

export const mockAppointments = [
  {
    id: 1,
    type: 'Visit Store',
    label: 'Store Visit for Order #9942',
    location: 'Tindahan Ni Isko - Main Campus',
    date: 'May 20, 2025',
    time: '10:30 AM - 11:00 AM',
  },
  {
    id: 2,
    type: 'Pick-up Order',
    label: 'Pick-up Order #9938',
    location: 'Tindahan Ni Isko - Main Campus',
    date: 'May 22, 2025',
    time: '10:30 AM - 11:00 AM',
  },
]

export const mockOrderPipeline = [
  { id: 'in_progress', label: 'In Progress', count: 2, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'for_pickup', label: 'For Pickup', count: 3, color: 'text-amber-600', bg: 'bg-amber-50' },
  { id: 'for_delivery', label: 'For Delivery', count: 5, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'completed', label: 'Completed', count: 2, color: 'text-gray-600', bg: 'bg-gray-50' },
]

export const mockQuickOverview = {
  totalOrders: 12,
  completedOrders: 8,
  appointments: 4,
  savedItems: 6,
}

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

