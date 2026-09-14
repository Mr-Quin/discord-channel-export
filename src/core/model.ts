export type Attachment = {
  id: string;
  name: string;
  size?: number;
  url: string;
  contentType?: string;
};

export type Author = {
  id: string;
  name: string;
  displayName?: string;
  avatarUrl?: string;
};

export type Message = {
  id: string;
  sortKey: string;
  timestamp: string;
  author: Author;
  content: string;
  attachments: Attachment[];
  raw: unknown;
};

export type Conversation = {
  source: string;
  id: string;
  url?: string;
  name?: string;
  groupId?: string;
  groupName?: string;
};

export type ConversationStats = {
  count: number;
  oldest?: { sortKey: string; timestamp: string };
  newest?: { sortKey: string; timestamp: string };
  newestExported?: string;
  updatedAt?: number;
};

export type StoredConversation = Conversation & ConversationStats;

export function conversationKey(c: Pick<Conversation, "source" | "id">): [string, string] {
  return [c.source, c.id];
}
