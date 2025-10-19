declare module 'tinykeys' {
  export type KeyBindingHandler = (event: KeyboardEvent) => void;
  export type KeyBindingMap = Record<string, KeyBindingHandler>;


  export function createKeybindingsHandler(
    keyBindingMap: KeyBindingMap
  ): (event: KeyboardEvent) => void;


  export function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: {
      timeout?: number;
      event?: 'keydown' | 'keyup';
      capture?: boolean;
    }
  ): () => void;


  export function parseKeybinding(
    keybinding: string
  ): Array<[string[], string]>;
}
