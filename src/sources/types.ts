import type { CaptureMatcher, CaptureRequest } from "../core/capture";
import type { Conversation, Message } from "../core/model";

export type PageAdapter = {
  findScroller(): HTMLElement | null;
  loadOlder(scroller: HTMLElement, step: number): void;
  atTop(scroller: HTMLElement): boolean;
};

export type Source = {
  id: string;
  label: string;
  matches: string[];
  matcher: CaptureMatcher;
  normalize(raw: unknown, request: CaptureRequest): Message | null;
  conversationFromPage(url: string, title: string): Conversation | null;
  sortKeyForDate(date: Date): string;
  dateForSortKey(key: string): Date;
  page: PageAdapter;
};
