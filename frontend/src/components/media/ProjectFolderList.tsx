import { clsx } from 'clsx'
import { Folder, FolderOpen, Inbox } from 'lucide-react'
import type { ProjectFolder } from '../../utils/mediaLibraryApi'

export type FolderSelection = number | 'unassigned' | null

interface ProjectFolderListProps {
  folders: ProjectFolder[]
  /** null is "everything", not Unassigned — Unassigned is its own folder. */
  selected: FolderSelection
  onSelect: (value: FolderSelection) => void
  allLabel?: string
}

function summary(folder: ProjectFolder): string {
  if (folder.asset_count === 0) return 'Empty'
  const parts: string[] = []
  if (folder.image_count) parts.push(`${folder.image_count} photo${folder.image_count === 1 ? '' : 's'}`)
  if (folder.video_count) parts.push(`${folder.video_count} video${folder.video_count === 1 ? '' : 's'}`)
  if (folder.submitted_count) parts.push(`${folder.submitted_count} in review`)
  return parts.join(' · ')
}

/** The library browsed by project: one button per folder, with what is in it. */
const ProjectFolderList = ({
  folders, selected, onSelect, allLabel = 'Every project',
}: ProjectFolderListProps) => (
  // Below md: one horizontally scrolling row of chips, so the grid keeps the
  // full width of a phone. From md up: the usual vertical folder list.
  <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
    <button type="button" onClick={() => onSelect(null)}
      className={clsx('shrink-0 md:w-full text-left px-3 py-2 rounded-lg text-sm border md:border-0 whitespace-nowrap md:whitespace-normal',
        selected === null ? 'bg-primary-50 text-primary-800 font-medium border-primary-200' : 'border-gray-200 hover:bg-gray-50')}>
      {allLabel}
    </button>
    {folders.length === 0 && (
      <p className="shrink-0 px-3 py-2 text-xs text-gray-500">No approved projects yet.</p>
    )}
    {folders.map((folder) => {
      const value: FolderSelection = folder.project_id ?? 'unassigned'
      const active = selected === value
      const Icon = folder.project_id === null ? Inbox : active ? FolderOpen : Folder
      return (
        <button key={String(value)} type="button" onClick={() => onSelect(value)}
          className={clsx('shrink-0 max-w-[14rem] md:max-w-none md:w-full text-left px-3 py-2 rounded-lg text-sm flex gap-2 border md:border-0',
            active ? 'bg-primary-50 text-primary-800 font-medium border-primary-200' : 'border-gray-200 hover:bg-gray-50')}>
          <Icon className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate">{folder.name}</span>
            <span className="block text-xs text-gray-500 font-normal">{summary(folder)}</span>
          </span>
        </button>
      )
    })}
  </div>
)

export default ProjectFolderList
