// Explicit imports for all product and branding images
import unnamed1 from '../assets/Images/unnamed (1).png'
import unnamed2 from '../assets/Images/unnamed (2).png'
import unnamed3 from '../assets/Images/unnamed (3).png'
import unnamed4 from '../assets/Images/unnamed (4).png'
import unnamed5 from '../assets/Images/unnamed (5).png'
import unnamed6 from '../assets/Images/unnamed (6).png'
import unnamed7 from '../assets/Images/unnamed (7).png'
import unnamed8 from '../assets/Images/unnamed (8).png'
import unnamed9 from '../assets/Images/unnamed (9).png'
import unnamed10 from '../assets/Images/unnamed (10).png'
import unnamed11 from '../assets/Images/unnamed (11).png'
import unnamed12 from '../assets/Images/unnamed (12).png'
import unnamedJpg from '../assets/Images/unnamed.jpg'

import brandShirt from '../assets/Branding/Copy of shirt.png'
import brandJacket from '../assets/Branding/Copy of jacket.png'
import brandCap from '../assets/Branding/Copy of cap.png'
import brandLanyard from '../assets/Branding/Copy of lanyard.png'
import brandBadge from '../assets/Branding/Copy of badge.png'
import brandStore from '../assets/Branding/Copy of store.png'

const imageMap = {
  // Unnamed images
  '/src/assets/Images/unnamed (1).png': unnamed1,
  '/src/assets/Images/unnamed (2).png': unnamed2,
  '/src/assets/Images/unnamed (3).png': unnamed3,
  '/src/assets/Images/unnamed (4).png': unnamed4,
  '/src/assets/Images/unnamed (5).png': unnamed5,
  '/src/assets/Images/unnamed (6).png': unnamed6,
  '/src/assets/Images/unnamed (7).png': unnamed7,
  '/src/assets/Images/unnamed (8).png': unnamed8,
  '/src/assets/Images/unnamed (9).png': unnamed9,
  '/src/assets/Images/unnamed (10).png': unnamed10,
  '/src/assets/Images/unnamed (11).png': unnamed11,
  '/src/assets/Images/unnamed (12).png': unnamed12,
  '/src/assets/Images/unnamed.jpg': unnamedJpg,

  // Branding images
  '/src/assets/Branding/Copy of shirt.png': brandShirt,
  '/src/assets/Branding/Copy of jacket.png': brandJacket,
  '/src/assets/Branding/Copy of cap.png': brandCap,
  '/src/assets/Branding/Copy of lanyard.png': brandLanyard,
  '/src/assets/Branding/Copy of badge.png': brandBadge,
  '/src/assets/Branding/Copy of store.png': brandStore,
}

export function getImageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (imageMap[normalizedPath]) {
    return imageMap[normalizedPath]
  }

  // Fallback: try matching by filename
  const filename = path.split('/').pop()
  const match = Object.entries(imageMap).find(([key]) => key.endsWith(filename))
  if (match) {
    return match[1]
  }

  return path
}
