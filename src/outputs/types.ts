import type { Conversation, Message } from "../core/model";

export type OutputContext = {
  conversation: Conversation;
  exportedAt: Date;
  theme?: "dark" | "light";
};

export type Output = {
  id: string;
  label: string;
  ext: string;
  mime: string;
  serialize(messages: Message[], ctx: OutputContext): string;
};
