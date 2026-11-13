export default function SkeletonCard() {
  return (
    <div className="flex flex-col animate-pulse">
      <div className="aspect-[16/9] bg-raised mb-3"></div>
      <div className="h-3 bg-raised w-1/3 mb-2"></div>
      <div className="h-5 bg-raised w-4/5 mb-2"></div>
      <div className="h-4 bg-raised w-full mb-2"></div>
      <div className="h-4 bg-raised w-2/3 mb-3"></div>
      <div className="h-4 bg-raised w-1/5"></div>
    </div>
  );
}
