import { Link } from 'react-router-dom'
import backIcon from '../../assets/icons/common/back.svg'

function PageHeader({ title, backTo, rightAction }) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:hidden">
      {backTo ? (
        <Link
          to={backTo}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0"
        >
          <img src={backIcon} alt="Back" className="w-5 h-5" />
        </Link>
      ) : (
        <div className="w-9 shrink-0" />
      )}
      <h1 className="flex-1 text-lg font-semibold text-gray-900 text-center truncate">{title}</h1>
      <div className="w-9 shrink-0 flex justify-end">{rightAction}</div>
    </header>
  )
}

export default PageHeader
