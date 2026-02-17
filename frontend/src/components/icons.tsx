import {
  BetweenHorizontalStart,
  Code,
  CodeXml,
  DatabaseZap,
  FileSpreadsheet,
  GitCompareArrows,
  Table2,
} from 'lucide-react'

interface IconProps {
  className?: string
}

const DEFAULT_CLASS = 'shrink-0'
const SIZE = 12
const STROKE = 1.8

export function DynamicIcon({ className }: IconProps) {
  return <BetweenHorizontalStart size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}

export function TableIcon({ className }: IconProps) {
  return <Table2 size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}

export function OverviewFileIcon({ className }: IconProps) {
  return <FileSpreadsheet size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}

export function OverviewDatabaseIcon({ className }: IconProps) {
  return <DatabaseZap size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}

export function CodeIcon({ className }: IconProps) {
  return <Code size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}

export function CodeXmlIcon({ className }: IconProps) {
  return <CodeXml size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}

export function CompareIcon({ className }: IconProps) {
  return <GitCompareArrows size={SIZE} strokeWidth={STROKE} className={className ?? DEFAULT_CLASS} />
}
