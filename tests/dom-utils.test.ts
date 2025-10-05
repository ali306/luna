import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DOMUtils } from '../src/modules/dom-utils.js';

describe('DOMUtils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('isTypingContext', () => {

    describe('text input elements', () => {
      it('should return true for text input', () => {

        const input = document.createElement('input');
        input.type = 'text';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should return true for email input', () => {

        const input = document.createElement('input');
        input.type = 'email';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should return true for password input', () => {

        const input = document.createElement('input');
        input.type = 'password';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should return true for textarea', () => {

        const textarea = document.createElement('textarea');


        const result = DOMUtils.isTypingContext(textarea);


        expect(result).toBe(true);
      });

      it('should return true for search input', () => {

        const input = document.createElement('input');
        input.type = 'search';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should return true for url input', () => {

        const input = document.createElement('input');
        input.type = 'url';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should return true for tel input', () => {

        const input = document.createElement('input');
        input.type = 'tel';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });
    });

    describe('non-text input elements', () => {
      it('should return false for checkbox input', () => {

        const input = document.createElement('input');
        input.type = 'checkbox';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for radio input', () => {

        const input = document.createElement('input');
        input.type = 'radio';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for submit input', () => {

        const input = document.createElement('input');
        input.type = 'submit';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for button input', () => {

        const input = document.createElement('input');
        input.type = 'button';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for file input', () => {

        const input = document.createElement('input');
        input.type = 'file';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for hidden input', () => {

        const input = document.createElement('input');
        input.type = 'hidden';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for range input', () => {

        const input = document.createElement('input');
        input.type = 'range';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });

      it('should return false for color input', () => {

        const input = document.createElement('input');
        input.type = 'color';


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(false);
      });
    });

    describe('select elements', () => {
      it('should return true for select element', () => {

        const select = document.createElement('select');


        const result = DOMUtils.isTypingContext(select);


        expect(result).toBe(true);
      });
    });

    describe('content editable elements', () => {
      it('should return true for element with contenteditable="true"', () => {

        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(true);
      });

      it('should return true for element with isContentEditable=true', () => {

        const div = document.createElement('div');
        Object.defineProperty(div, 'isContentEditable', {
          value: true,
          configurable: true
        });


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(true);
      });

      it('should return false for element with contenteditable="false"', () => {

        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'false');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(false);
      });
    });

    describe('role-based elements', () => {
      it('should return true for element with role="textbox"', () => {

        const div = document.createElement('div');
        div.setAttribute('role', 'textbox');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(true);
      });

      it('should return true for element with role="searchbox"', () => {

        const div = document.createElement('div');
        div.setAttribute('role', 'searchbox');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(true);
      });

      it('should return true for element with role="TEXTBOX" (case insensitive)', () => {

        const div = document.createElement('div');
        div.setAttribute('role', 'TEXTBOX');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(true);
      });

      it('should return false for element with role="button"', () => {

        const div = document.createElement('div');
        div.setAttribute('role', 'button');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should return false for null element', () => {

        const result = DOMUtils.isTypingContext(null);


        expect(result).toBe(false);
      });

      it('should return false for undefined element', () => {

        const result = DOMUtils.isTypingContext(undefined as any);


        expect(result).toBe(false);
      });

      it('should return false for regular div element', () => {

        const div = document.createElement('div');


        const result = DOMUtils.isTypingContext(div);


        expect(result).toBe(false);
      });

      it('should return false for button element', () => {

        const button = document.createElement('button');


        const result = DOMUtils.isTypingContext(button);


        expect(result).toBe(false);
      });

      it('should return true for input with no type (defaults to text)', () => {

        const input = document.createElement('input');



        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should handle input with null type', () => {

        const input = document.createElement('input');
        Object.defineProperty(input, 'type', {
          value: null,
          configurable: true
        });


        const result = DOMUtils.isTypingContext(input);


        expect(result).toBe(true);
      });

      it('should handle element without tagName', () => {

        const element = {
          getAttribute: vi.fn().mockReturnValue(null)
        } as any;


        const result = DOMUtils.isTypingContext(element);


        expect(result).toBe(false);
      });
    });
  });

  describe('showError', () => {
    it('should create and append error div when container exists', () => {

      const container = document.createElement('div');
      container.className = 'container';
      document.body.appendChild(container);
      const errorMessage = 'Test error message';


      DOMUtils.showError(errorMessage);


      const errorDiv = container.querySelector('div');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv?.textContent).toBe(errorMessage);
      expect(errorDiv?.style.textAlign).toBe('center');
      expect(errorDiv?.style.padding).toBe('20px');
    });

    it('should not create error div when container does not exist', () => {

      const errorMessage = 'Test error message';


      DOMUtils.showError(errorMessage);


      const errorDiv = document.querySelector('div');
      expect(errorDiv).toBeNull();
    });

    it('should handle empty error message', () => {

      const container = document.createElement('div');
      container.className = 'container';
      document.body.appendChild(container);
      const errorMessage = '';


      DOMUtils.showError(errorMessage);


      const errorDiv = container.querySelector('div');
      expect(errorDiv).toBeTruthy();
      expect(errorDiv?.textContent).toBe('');
    });

    it('should append multiple error messages', () => {

      const container = document.createElement('div');
      container.className = 'container';
      document.body.appendChild(container);


      DOMUtils.showError('First error');
      DOMUtils.showError('Second error');


      const errorDivs = container.querySelectorAll('div');
      expect(errorDivs).toHaveLength(2);
      expect(errorDivs[0].textContent).toBe('First error');
      expect(errorDivs[1].textContent).toBe('Second error');
    });

    it('should handle special characters in error message', () => {

      const container = document.createElement('div');
      container.className = 'container';
      document.body.appendChild(container);
      const errorMessage = '<script>alert("test")</script>';


      DOMUtils.showError(errorMessage);


      const errorDiv = container.querySelector('div');
      expect(errorDiv?.textContent).toBe(errorMessage);

      expect(errorDiv?.innerHTML).not.toContain('<script>');
    });
  });
});