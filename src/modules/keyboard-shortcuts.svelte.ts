
import { tinykeys } from 'tinykeys';

type KeyboardShortcutHandler = (event: KeyboardEvent) => void | Promise<void>;

interface ShortcutConfig {
  key: string;
  code?: string;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
  shift?: boolean;
  allowInInput?: boolean;
  handler: KeyboardShortcutHandler;
  description?: string;
}

class KeyboardShortcutsManager {
  private shortcuts = new Map<string, ShortcutConfig>();
  private unsubscribe: (() => void) | null = null;

  addShortcut(config: ShortcutConfig): void {
    const shortcutKey = this.getShortcutKey(config);
    this.shortcuts.set(shortcutKey, config);
  }

  removeShortcut(config: Omit<ShortcutConfig, 'handler'>): void {
    const shortcutKey = this.getShortcutKey(config as ShortcutConfig);
    this.shortcuts.delete(shortcutKey);
  }

  clearShortcuts(): void {
    this.shortcuts.clear();
  }

  unregister(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }


  reregister(): void {

    this.unregister();


    const keymap: Record<string, (event: KeyboardEvent) => void> = {};

    for (const [, config] of this.shortcuts) {
      const tinykeySequence = this.configToTinykeysSequence(config);

      keymap[tinykeySequence] = (event: KeyboardEvent) => {

        if (!config.allowInInput && this.isTypingContext(event.target as Element)) {
          return;
        }



        if (config.ctrl === false && event.ctrlKey) return;
        if (config.alt === false && event.altKey) return;
        if (config.meta === false && event.metaKey) return;
        if (config.shift === false && event.shiftKey) return;


        event.preventDefault();
        event.stopPropagation();


        try {
          const result = config.handler(event);
          if (result instanceof Promise) {
            result.catch(error => {
              console.error(`[KeyboardShortcuts] Error in async handler:`, error);
            });
          }
        } catch (error) {
          console.error(`[KeyboardShortcuts] Error in handler:`, error);
        }
      };
    }


    this.unsubscribe = tinykeys(window, keymap);
  }


  private configToTinykeysSequence(config: ShortcutConfig): string {
    const parts: string[] = [];


    if (config.ctrl) parts.push('Control');
    if (config.alt) parts.push('Alt');
    if (config.meta) parts.push('Meta');
    if (config.shift) parts.push('Shift');



    if (config.code) {
      const key = this.codeToKey(config.code);
      parts.push(key);
    } else if (config.key) {
      parts.push(config.key);
    }

    return parts.join('+');
  }

  private codeToKey(code: string): string {


    const specialKeys: Record<string, string> = {
      'Space': 'Space',
      'Escape': 'Escape',
      'Enter': 'Enter',
      'Tab': 'Tab',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'ArrowUp': 'ArrowUp',
      'ArrowDown': 'ArrowDown',
      'ArrowLeft': 'ArrowLeft',
      'ArrowRight': 'ArrowRight',
    };

    if (specialKeys[code]) {
      return specialKeys[code];
    }



    if (code.startsWith('Key')) {
      return code;
    }


    if (code.startsWith('Digit')) {
      return code;
    }


    return code;
  }

  private getShortcutKey(config: ShortcutConfig): string {
    const parts: string[] = [];

    if (config.ctrl) parts.push('Ctrl');
    if (config.alt) parts.push('Alt');
    if (config.meta) parts.push('Meta');
    if (config.shift) parts.push('Shift');

    parts.push(config.code || config.key);

    return parts.join('+');
  }


  private isTypingContext(target: Element | null): boolean {
    if (!target) return false;

    const tagName = target.tagName?.toLowerCase();
    const textInputTags = ['input', 'textarea'];

    if (textInputTags.includes(tagName)) {
      if (tagName === 'input') {
        const inputType = (target as HTMLInputElement).type?.toLowerCase() || 'text';
        const nonTextTypes = ['checkbox', 'radio', 'submit', 'button', 'reset', 'file', 'hidden', 'image', 'color', 'range'];
        return !nonTextTypes.includes(inputType);
      }
      return true;
    }

    if (tagName === 'select') return true;

    const isContentEditable = (target as any).isContentEditable === true ||
      target.getAttribute('contenteditable') === 'true';
    if (isContentEditable) return true;

    const role = target.getAttribute('role');
    if (role && ['textbox', 'searchbox'].includes(role.toLowerCase())) return true;

    return false;
  }
}


export const keyboardShortcuts = new KeyboardShortcutsManager();


export type { KeyboardShortcutHandler, ShortcutConfig };
