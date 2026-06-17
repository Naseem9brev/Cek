import { initCapture, type PlatformSelectors } from "./shared";

const selectors: PlatformSelectors = {
  composer: [
    'div[contenteditable="true"][data-placeholder]',
    'div.ProseMirror[contenteditable="true"]',
    'fieldset div[contenteditable="true"]',
  ],
  sendButton: [
    'button[aria-label="Send message"]',
    'button[aria-label="Send Message"]',
    'button[data-testid="send-button"]',
  ],
  messageBlocks: [
    '[data-testid="user-message"]',
    '.font-user-message',
  ],
  assistantBlocks: [
    '[data-testid="assistant-message"]',
    '.font-claude-message',
    '[data-is-streaming]',
  ],
  streamingIndicator: ['[data-is-streaming="true"]'],
  conversationRoot: ["main", '[data-testid="conversation"]', "body"],
  modelLabel: [
    '[data-testid="model-selector-dropdown"]',
    'button[aria-haspopup="listbox"]',
  ],
};

initCapture("claude", selectors, "Claude Sonnet");
