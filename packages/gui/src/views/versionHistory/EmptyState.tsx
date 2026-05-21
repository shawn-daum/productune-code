import { emptyWrap, emptyIcon, emptyText } from './styles'

export default function EmptyState({ message }: { message: string }) {
  return (
    <div style={emptyWrap}>
      <div style={emptyIcon}>◎</div>
      <div style={emptyText}>{message}</div>
    </div>
  )
}
