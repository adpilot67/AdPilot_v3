(function() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;

  let confirmClicked = false;
  let closeScheduled = false;

  function sendResult(success, error) {
    chrome.runtime.sendMessage({ action: 'quickSignInResult', success, error });
    if (success) {
      chrome.runtime.sendMessage({ action: 'quickSignInSuccess' });
    }
  }

  function closeThisWindow() {
    if (closeScheduled) return;
    closeScheduled = true;
    chrome.runtime.sendMessage({ action: 'closeWindow' });
  }

  function watchForError() {
    function checkError() {
      const modals = document.querySelectorAll('.modal-content');
      for (const modal of modals) {
        const text = modal.innerText || '';
        if (text.includes('Log in Failed') && text.includes('The Quick Sign In code was not verified')) {
          console.log('❌ Error modal detected – closing immediately');
          sendResult(false, 'Invalid code');
          closeThisWindow();
          return true;
        }
      }
      return false;
    }
    if (checkError()) return;
    const observer = new MutationObserver(() => {
      if (checkError()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function watchForSuccess() {
    function checkSuccess() {
      const modals = document.querySelectorAll('.modal-content');
      for (const modal of modals) {
        const text = modal.innerText || '';
        if (text.includes('Log in Successful') && text.includes('Computer logged in')) {
          console.log('✅ Success modal detected – waiting 2 seconds');
          sendResult(true);
          setTimeout(closeThisWindow, 2000);
          return true;
        }
      }
      return false;
    }
    if (checkSuccess()) return;
    const observer = new MutationObserver(() => {
      if (checkSuccess()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function fillAndSubmit() {
    const input = document.querySelector('input.quick-sign-in-input');
    if (!input) return;

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    setTimeout(() => {
      const cont = document.querySelector('button.quick-sign-in-confirm-btn');
      if (cont && !cont.disabled) {
        cont.click();
        console.log('✅ Continue clicked');
        watchForConfirm();
      }
    }, 500);
  }

  function watchForConfirm() {
    const startTime = Date.now();
    let buttonStableTime = 0;
    let scheduledClick = false;

    function findConfirmButton() {
      const btn = document.querySelector('button.validate-code-accept-button');
      if (btn && !btn.disabled && btn.offsetParent !== null) return btn;
      return null;
    }

    function performClick(btn) {
      const rect = btn.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;

      btn.click();
      btn.dispatchEvent(new MouseEvent('mousedown', { view: window, bubbles: true, cancelable: true, clientX, clientY }));
      btn.dispatchEvent(new MouseEvent('mouseup', { view: window, bubbles: true, cancelable: true, clientX, clientY }));
      btn.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, clientX, clientY }));
      console.log('🖱️ Confirm clicked');
    }

    function tryClickConfirm() {
      if (confirmClicked || scheduledClick) return true;
      const btn = findConfirmButton();
      if (btn) {
        if (buttonStableTime === 0) buttonStableTime = Date.now();
        if (Date.now() - buttonStableTime < 300) return false;
        scheduledClick = true;
        setTimeout(() => {
          if (confirmClicked) return;
          if (btn.disabled) {
            scheduledClick = false;
            buttonStableTime = 0;
            return;
          }
          performClick(btn);
          confirmClicked = true;
          watchForSuccess();
        }, 100);
        return true;
      } else {
        buttonStableTime = 0;
      }
      return false;
    }

    if (tryClickConfirm()) return;

    const observer = new MutationObserver(() => {
      if (tryClickConfirm()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = setInterval(() => {
      if (tryClickConfirm()) {
        clearInterval(interval);
        observer.disconnect();
        return;
      }
      if (Date.now() - startTime > 20000) {
        console.log('⏰ Timeout – closing');
        clearInterval(interval);
        observer.disconnect();
        sendResult(false, 'Timeout');
        closeThisWindow();
      }
    }, 300);
  }

  // Start watchers
  watchForError();
  watchForSuccess();
  fillAndSubmit();

  setTimeout(() => {
    if (!document.querySelector('input.quick-sign-in-input')) {
      sendResult(false, 'Input not found');
      closeThisWindow();
    }
  }, 10000);
})();
