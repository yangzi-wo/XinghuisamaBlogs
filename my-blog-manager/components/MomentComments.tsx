"use client";

import Comments from "./Comments";

interface MomentCommentsProps {
  id: string;
}

export default function MomentComments({ id }: MomentCommentsProps) {
  return <Comments targetPath={`/moments/${id}`} />;
}
