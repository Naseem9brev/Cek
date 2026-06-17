import { initCapture, type PlatformSelectors } from "./shared";

const selectors: PlatformSelectors = {
  composer: [
    "#prompt-textarea",
    'div[contenteditable="true"]#prompt-textarea',
    'div[contenteditable="true"][data-testid="composer"]',
    'textarea[data-testid="composer-textarea"]',
  ],
  sendButton: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Send message"]',
  ],
  messageBlocks: [
    '[data-message-author-role="user"]',
    'div[data-testid*="user"]',
  ],
  modelLabel: [
    '[data-testid="model-switcher-dropdown-button"]',
    'button[data-testid="model-switcher"]',
  ],
};

initCapture("chatgpt", selectors, "GPT-4o");
