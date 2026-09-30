export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.jpeg"
      alt="ACDAN Consultores"
      className={className ?? 'h-11 w-auto'}
    />
  )
}