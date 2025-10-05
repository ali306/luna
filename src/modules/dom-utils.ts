export class DOMUtils {
  public static isTypingContext(target: Element | null): boolean {
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

  public static showError(message: string): void {
    const container = document.querySelector('.container');
    if (container) {
      const errorDiv = document.createElement('div');
      errorDiv.style.color = 'oklch(57.7% 0.245 27.325)';
      errorDiv.style.textAlign = 'center';
      errorDiv.style.padding = '20px';
      errorDiv.textContent = message;
      container.appendChild(errorDiv);
    }
  }
}