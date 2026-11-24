"use client";

import Comments from "./Comments";

export default function LabComments({ pageId }: { pageId?: string }) {
  return <Comments targetPath={pageId ? `/lab/${pageId}` : undefined} />;
}
