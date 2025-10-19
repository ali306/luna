export class DOMUtils {
  static isTypingContext(element: Element | null | undefined): boolean {
    if (!element) {
      return false;
    }

    const tagName = element.tagName?.toLowerCase();

    // Check for input elements
    if (tagName === 'input') {
      const inputType = (element as HTMLInputElement).type?.toLowerCase() || 'text';
      const textInputTypes = ['text', 'email', 'password', 'search', 'url', 'tel'];
      return textInputTypes.includes(inputType);
    }

    // Check for textarea
    if (tagName === 'textarea') {
      return true;
    }

    // Check for select
    if (tagName === 'select') {
      return true;
    }

    // Check for contenteditable
    const contentEditable = element.getAttribute('contenteditable');
    if (contentEditable === 'true' || (element as HTMLElement).isContentEditable) {
      return true;
    }

    // Check for role attribute
    const role = element.getAttribute('role')?.toLowerCase();
    if (role === 'textbox' || role === 'searchbox') {
      return true;
    }

    return false;
  }

  static showError(message: string): void {
    const container = document.querySelector('.container');
    if (container) {
      const errorDiv = document.createElement('div');
      errorDiv.textContent = message;
      errorDiv.style.textAlign = 'center';
      errorDiv.style.padding = '20px';
      container.appendChild(errorDiv);
    }
  }
}
