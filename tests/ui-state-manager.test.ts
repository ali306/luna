import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UIStateManager } from '../src/modules/ui-state-manager.js';
import type {AppMode, StatusType } from '../src/types/index.js';

describe('UIStateManager', () => {
  let uiStateManager: UIStateManager;
  let mockElements: { [key: string]: HTMLElement };

  beforeEach(() => {

    document.body.innerHTML = '';

    mockElements = {
      status: document.createElement('div'),
      assistantResponse: document.createElement('div'),
      textInput: document.createElement('input'),
      connectionDot: document.createElement('div'),
      connectionText: document.createElement('div'),
      haloPath: document.createElementNS('http://www.w3.org/2000/svg', 'path')
    };


    mockElements.status.id = 'status';
    mockElements.assistantResponse.id = 'assistantResponse';
    mockElements.textInput.id = 'textInput';
    mockElements.connectionDot.id = 'connectionDot';
    mockElements.connectionText.id = 'connectionText';
    mockElements.haloPath.classList.add('halo-path');


    Object.values(mockElements).forEach(element => {
      document.body.appendChild(element);
    });

    uiStateManager = new UIStateManager();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {

      const state = uiStateManager.getState();


      expect(state).toEqual({
        mode: 'idle',
        connected: false,
        backendReady: false,
        responseVisible: false
      });
    });

    it('should initialize with null DOM elements', () => {

      const domElements = uiStateManager.getDOMElements();


      expect(domElements.haloPath).toBeNull();
      expect(domElements.status).toBeNull();
      expect(domElements.assistantResponse).toBeNull();
      expect(domElements.textInput).toBeNull();
      expect(domElements.connectionDot).toBeNull();
      expect(domElements.connectionText).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should find and cache DOM elements when they exist', async () => {

      await uiStateManager.initialize();


      const domElements = uiStateManager.getDOMElements();
      expect(domElements.haloPath).toBe(mockElements.haloPath);
      expect(domElements.status).toBe(mockElements.status);
      expect(domElements.assistantResponse).toBe(mockElements.assistantResponse);
      expect(domElements.textInput).toBe(mockElements.textInput);
      expect(domElements.connectionDot).toBe(mockElements.connectionDot);
      expect(domElements.connectionText).toBe(mockElements.connectionText);
    });

    it('should timeout when required elements are not found', async () => {

      document.body.innerHTML = '';
      vi.useFakeTimers();


      const initPromise = uiStateManager.initialize();


      vi.advanceTimersByTime(10000);


      await expect(initPromise).rejects.toThrow('Required DOM elements not found within timeout');

      vi.useRealTimers();
    });

    it('should wait for DOM elements to appear via MutationObserver', async () => {

      document.body.innerHTML = '';
      const manager = new UIStateManager();


      const initPromise = manager.initialize();


      setTimeout(() => {
        Object.values(mockElements).forEach(element => {
          document.body.appendChild(element);
        });
      }, 100);


      await expect(initPromise).resolves.toBeUndefined();

      const domElements = manager.getDOMElements();
      expect(domElements.status).toBe(mockElements.status);
    });

    it('should handle partial DOM elements', async () => {

      document.body.innerHTML = '';

      document.body.appendChild(mockElements.status);
      document.body.appendChild(mockElements.haloPath);

      vi.useFakeTimers();


      const initPromise = uiStateManager.initialize();
      vi.advanceTimersByTime(10000);


      await expect(initPromise).rejects.toThrow('Required DOM elements not found within timeout');

      vi.useRealTimers();
    });
  });

  describe('state management', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should get current state', () => {

      const state = uiStateManager.getState();


      expect(state).toEqual({
        mode: 'idle',
        connected: false,
        backendReady: false,
        responseVisible: false
      });
    });

    it('should return a copy of state, not the original', () => {

      const state1 = uiStateManager.getState();
      const state2 = uiStateManager.getState();


      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);


      state1.mode = 'recording';
      expect(uiStateManager.getState().mode).toBe('idle');
    });

    it('should update state with partial update', () => {

      uiStateManager.setState({ mode: 'recording', connected: true });


      const state = uiStateManager.getState();
      expect(state.mode).toBe('recording');
      expect(state.connected).toBe(true);
      expect(state.backendReady).toBe(false);
      expect(state.responseVisible).toBe(false);
    });

    it('should log state transition when mode changes', () => {

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });


      uiStateManager.setState({ mode: 'recording' });


      expect(consoleSpy).toHaveBeenCalledWith('State transition: idle -> recording');

      consoleSpy.mockRestore();
    });

    it('should not log when mode does not change', () => {

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });


      uiStateManager.setState({ connected: true });


      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should blur text input when exiting text mode', async () => {

      vi.useFakeTimers();
      const textInput = mockElements.textInput as HTMLInputElement;
      const blurSpy = vi.spyOn(textInput, 'blur');


      uiStateManager.setState({ mode: 'text' });


      uiStateManager.setState({ mode: 'idle' });


      await vi.runAllTimersAsync();


      expect(blurSpy).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should not blur text input if mode returns to text quickly', async () => {

      vi.useFakeTimers();
      const textInput = mockElements.textInput as HTMLInputElement;
      const blurSpy = vi.spyOn(textInput, 'blur');

      uiStateManager.setState({ mode: 'text' });
      uiStateManager.setState({ mode: 'idle' });
      uiStateManager.setState({ mode: 'text' });


      await vi.runAllTimersAsync();


      expect(blurSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('mode management', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should set mode', () => {

      uiStateManager.setMode('recording');


      expect(uiStateManager.getState().mode).toBe('recording');
    });

    it('should set connected state', () => {

      uiStateManager.setConnected(true);


      expect(uiStateManager.getState().connected).toBe(true);
    });

    it('should set backend ready state', () => {

      uiStateManager.setBackendReady(true);


      expect(uiStateManager.getState().backendReady).toBe(true);
    });

    it('should test all possible app modes', () => {

      const modes: AppMode[] = ['idle', 'recording', 'processing', 'speaking', 'text'];


      modes.forEach(mode => {
        uiStateManager.setMode(mode);
        expect(uiStateManager.getState().mode).toBe(mode);
      });
    });
  });

  describe('status display', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should show status message with default settings', () => {

      uiStateManager.showStatus('Test message');


      const status = mockElements.status;
      expect(status.textContent).toBe('Test message');
      expect(status.className).toBe('status visible ');
    });

    it('should show status message with type', () => {

      uiStateManager.showStatus('Error message', false, 'error');


      const status = mockElements.status;
      expect(status.textContent).toBe('Error message');
      expect(status.className).toBe('status visible error');
    });

    it('should show persistent status message', () => {

      vi.useFakeTimers();


      uiStateManager.showStatus('Persistent message', true);


      vi.advanceTimersByTime(4000);


      const status = mockElements.status;
      expect(status.classList.contains('visible')).toBe(true);

      vi.useRealTimers();
    });

    it('should auto-hide non-persistent status message', () => {

      vi.useFakeTimers();


      uiStateManager.showStatus('Temporary message', false);


      expect(mockElements.status.classList.contains('visible')).toBe(true);


      vi.advanceTimersByTime(3000);


      expect(mockElements.status.classList.contains('visible')).toBe(false);

      vi.useRealTimers();
    });

    it('should handle missing status element', () => {

      const domElements = uiStateManager.getDOMElements();
      domElements.status = null;


      expect(() => uiStateManager.showStatus('Test')).not.toThrow();
    });

    it('should test all status types', () => {

      const types: StatusType[] = ['', 'error', 'success'];


      types.forEach(type => {
        uiStateManager.showStatus('Test message', false, type);
        expect(mockElements.status.className).toBe(`status visible ${type}`);
      });
    });
  });

  describe('assistant response display', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should display assistant response', () => {

      uiStateManager.displayAssistantResponse('Hello world');


      const response = mockElements.assistantResponse;
      expect(response.textContent).toBe('Hello world');
      expect(response.title).toBe('Hello world');
    });

    it('should truncate long responses', () => {

      const longResponse = 'A'.repeat(150);


      uiStateManager.displayAssistantResponse(longResponse);


      const response = mockElements.assistantResponse;
      expect(response.textContent).toBe('A'.repeat(137) + '...');
      expect(response.title).toBe(longResponse);
    });

    it('should not truncate short responses', () => {

      const shortResponse = 'A'.repeat(100);


      uiStateManager.displayAssistantResponse(shortResponse);


      const response = mockElements.assistantResponse;
      expect(response.textContent).toBe(shortResponse);
      expect(response.title).toBe(shortResponse);
    });

    it('should show response when responseVisible is true', () => {

      uiStateManager.setState({ responseVisible: true });


      uiStateManager.displayAssistantResponse('Test response');


      expect(mockElements.assistantResponse.classList.contains('visible')).toBe(true);
    });

    it('should not show response when responseVisible is false', () => {

      uiStateManager.setState({ responseVisible: false });


      uiStateManager.displayAssistantResponse('Test response');


      expect(mockElements.assistantResponse.classList.contains('visible')).toBe(false);
    });

    it('should handle empty response', () => {

      expect(() => uiStateManager.displayAssistantResponse('')).not.toThrow();
      expect(mockElements.assistantResponse.textContent).toBe('');
    });

    it('should handle null response element', () => {

      const domElements = uiStateManager.getDOMElements();
      domElements.assistantResponse = null;


      expect(() => uiStateManager.displayAssistantResponse('Test')).not.toThrow();
    });

    it('should handle exactly boundary length responses', () => {

      const boundaryResponse = 'A'.repeat(140);


      uiStateManager.displayAssistantResponse(boundaryResponse);


      const response = mockElements.assistantResponse;
      expect(response.textContent).toBe(boundaryResponse);
      expect(response.title).toBe(boundaryResponse);
    });
  });

  describe('response visibility toggle', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should toggle response visibility from false to true', () => {

      mockElements.assistantResponse.textContent = 'Test response';


      uiStateManager.toggleResponseVisibility();


      expect(uiStateManager.getState().responseVisible).toBe(true);
      expect(mockElements.assistantResponse.classList.contains('visible')).toBe(true);
    });

    it('should toggle response visibility from true to false', () => {

      uiStateManager.setState({ responseVisible: true });
      mockElements.assistantResponse.classList.add('visible');


      uiStateManager.toggleResponseVisibility();


      expect(uiStateManager.getState().responseVisible).toBe(false);
      expect(mockElements.assistantResponse.classList.contains('visible')).toBe(false);
    });

    it('should not show response when toggling to true but no content', () => {

      mockElements.assistantResponse.textContent = '';


      uiStateManager.toggleResponseVisibility();


      expect(uiStateManager.getState().responseVisible).toBe(true);
      expect(mockElements.assistantResponse.classList.contains('visible')).toBe(false);
    });

    it('should handle missing assistantResponse element', () => {

      const domElements = uiStateManager.getDOMElements();
      domElements.assistantResponse = null;


      expect(() => uiStateManager.toggleResponseVisibility()).not.toThrow();
      expect(uiStateManager.getState().responseVisible).toBe(true);
    });
  });

  describe('text input management', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should get text input value', () => {

      const textInput = mockElements.textInput as HTMLInputElement;
      textInput.value = '  Hello world  ';


      const value = uiStateManager.getTextInputValue();


      expect(value).toBe('Hello world');
    });

    it('should return empty string when text input is empty', () => {

      const textInput = mockElements.textInput as HTMLInputElement;
      textInput.value = '';


      const value = uiStateManager.getTextInputValue();


      expect(value).toBe('');
    });

    it('should return empty string when text input is null', () => {

      const domElements = uiStateManager.getDOMElements();
      domElements.textInput = null;


      const value = uiStateManager.getTextInputValue();


      expect(value).toBe('');
    });

    it('should clear text input', () => {

      const textInput = mockElements.textInput as HTMLInputElement;
      textInput.value = 'Test value';


      uiStateManager.clearTextInput();


      expect(textInput.value).toBe('');
    });

    it('should handle clear when text input is null', () => {

      const domElements = uiStateManager.getDOMElements();
      domElements.textInput = null;


      expect(() => uiStateManager.clearTextInput()).not.toThrow();
    });

    it('should focus text input', () => {

      const textInput = mockElements.textInput as HTMLInputElement;
      const focusSpy = vi.spyOn(textInput, 'focus');


      uiStateManager.focusTextInput();


      expect(focusSpy).toHaveBeenCalled();
    });

    it('should handle focus when text input is null', () => {

      const domElements = uiStateManager.getDOMElements();
      domElements.textInput = null;


      expect(() => uiStateManager.focusTextInput()).not.toThrow();
    });
  });

  describe('UI updates', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    describe('connection indicator', () => {
      it('should show recording state', () => {

        uiStateManager.setState({ mode: 'recording' });


        expect(mockElements.connectionDot.classList.contains('recording')).toBe(true);
        expect(mockElements.connectionText.textContent).toBe('Recording');
      });

      it('should show connected state', () => {

        uiStateManager.setState({ connected: true, mode: 'idle' });


        expect(mockElements.connectionDot.classList.contains('connected')).toBe(true);
        expect(mockElements.connectionText.textContent).toBe('Connected');
      });

      it('should show disconnected state', () => {

        uiStateManager.setState({ connected: false, mode: 'idle' });


        expect(mockElements.connectionDot.classList.contains('disconnected')).toBe(true);
        expect(mockElements.connectionText.textContent).toBe('Not connected');
      });

      it('should prioritize recording state over connected state', () => {

        uiStateManager.setState({ connected: true, mode: 'recording' });


        expect(mockElements.connectionDot.classList.contains('recording')).toBe(true);
        expect(mockElements.connectionDot.classList.contains('connected')).toBe(false);
        expect(mockElements.connectionText.textContent).toBe('Recording');
      });

      it('should handle missing connection elements', () => {

        const domElements = uiStateManager.getDOMElements();
        domElements.connectionDot = null;
        domElements.connectionText = null;


        expect(() => uiStateManager.setState({ connected: true })).not.toThrow();
      });
    });

    describe('text input visibility', () => {
      it('should show text input in text mode', async () => {

        vi.useFakeTimers();


        uiStateManager.setState({ mode: 'text' });


        expect(mockElements.textInput.classList.contains('visible')).toBe(true);


        await vi.runAllTimersAsync();

        vi.useRealTimers();
      });

      it('should hide text input when not in text mode', () => {

        mockElements.textInput.classList.add('visible');


        uiStateManager.setState({ mode: 'idle' });


        expect(mockElements.textInput.classList.contains('visible')).toBe(false);
      });

      it('should handle missing text input element', () => {

        const domElements = uiStateManager.getDOMElements();
        domElements.textInput = null;


        expect(() => uiStateManager.setState({ mode: 'text' })).not.toThrow();
      });
    });

    describe('status display updates', () => {
      it('should show waiting message when backend is not ready', () => {

        uiStateManager.setState({ backendReady: false });


        expect(mockElements.status.textContent).toBe('Waiting for backend to start');
        expect(mockElements.status.className).toBe('status visible');
      });

      it('should hide status when backend is ready', () => {

        mockElements.status.classList.add('visible');


        uiStateManager.setState({ backendReady: true });


        expect(mockElements.status.classList.contains('visible')).toBe(false);
      });

      it('should handle missing status element for backend status', () => {

        const domElements = uiStateManager.getDOMElements();
        domElements.status = null;


        expect(() => uiStateManager.setState({ backendReady: false })).not.toThrow();
      });
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should delegate error display to DOMUtils', () => {

      const container = document.createElement('div');
      container.className = 'container';
      document.body.appendChild(container);


      uiStateManager.showError('Test error');


      const errorDiv = container.querySelector('div');
      expect(errorDiv?.textContent).toBe('Test error');
    });

    it('should handle showError when no container exists', () => {

      expect(() => uiStateManager.showError('Test error')).not.toThrow();
    });
  });

  describe('edge cases and boundary conditions', () => {
    beforeEach(async () => {
      await uiStateManager.initialize();
    });

    it('should handle initialization with some elements present', async () => {

      document.body.innerHTML = '';

      document.body.appendChild(mockElements.status);
      document.body.appendChild(mockElements.haloPath);

      vi.useFakeTimers();


      const initPromise = uiStateManager.initialize();


      setTimeout(() => {
        document.body.appendChild(mockElements.assistantResponse);
        document.body.appendChild(mockElements.textInput);
        document.body.appendChild(mockElements.connectionDot);
        document.body.appendChild(mockElements.connectionText);
      }, 100);

      vi.advanceTimersByTime(200);


      await expect(initPromise).resolves.toBeUndefined();

      vi.useRealTimers();
    });

    it('should handle rapid state changes', () => {

      uiStateManager.setState({ mode: 'recording' });
      uiStateManager.setState({ mode: 'processing' });
      uiStateManager.setState({ mode: 'speaking' });
      uiStateManager.setState({ mode: 'idle' });


      expect(uiStateManager.getState().mode).toBe('idle');
    });

    it('should handle state updates with no changes', () => {

      const initialState = uiStateManager.getState();


      uiStateManager.setState({});


      expect(uiStateManager.getState()).toEqual(initialState);
    });

    it('should handle text input with only whitespace', () => {

      const textInput = mockElements.textInput as HTMLInputElement;
      textInput.value = '   \n\t   ';


      const value = uiStateManager.getTextInputValue();


      expect(value).toBe('');
    });

    it('should handle response truncation at exact boundary', () => {

      const response141 = 'A'.repeat(141);


      uiStateManager.displayAssistantResponse(response141);


      const expectedTruncated = 'A'.repeat(137) + '...';
      expect(mockElements.assistantResponse.textContent).toBe(expectedTruncated);
      expect(mockElements.assistantResponse.title).toBe(response141);
    });
  });
});