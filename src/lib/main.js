import '../styles/main.scss';
import '../styles/themes.scss';
import '../styles/page.scss';
import '../styles/list.scss';
import '../styles/sidenav.scss';
import '../styles/tile.scss';
import '../styles/contextMenu.scss';
import '../styles/dialogs.scss';
import '../styles/help.scss';
import '../styles/overrideAceStyle.scss';
import 'core-js/stable';
import 'html-tag-js/dist/polyfill';
import ajax from '@deadlyjack/ajax';
import tag from 'html-tag-js';
import mustache from 'mustache';
import git from './git';
import tile from '../components/tile';
import sidenav from '../components/sidenav';
import contextMenu from '../components/contextMenu';
import EditorManager from './editorManager';
import ActionStack from './actionStack';
import helpers from './utils/helpers';
import Settings from './settings';
import dialogs from '../components/dialogs';
import constants from './constants';
import intentHandler from './handlers/intent';
import openFolder from './openFolder';
import arrowkeys from './handlers/arrowkeys';
import commands from './commands';
import keyBindings from './keyBindings';
import quickTools from './handlers/quickTools';
import loadPolyFill from './utils/polyfill';
import Url from './utils/Url';
import applySettings from './applySettings';
import fsOperation from './fileSystem/fsOperation';
import run from './run';
import toast from '../components/toast';
import $_menu from '../views/menu.hbs';
import $_fileMenu from '../views/file-menu.hbs';
import Icon from '../components/icon';
import restoreTheme from './restoreTheme';

loadPolyFill.apply(window);
window.onload = Main;

async function Main() {
  const oldPreventDefault = TouchEvent.prototype.preventDefault;
  TouchEvent.prototype.preventDefault = function () {
    if (this.cancelable) {
      oldPreventDefault.bind(this)();
    }
  };

  ajax({
    url: 'https://acode.foxdebug.com/api/getad',
    responseType: 'json',
  }).then((/**@type {Promotion} */ promotion) => {
    window.promotion = promotion;
    if (promotion?.image) {
      (async () => {
        const image = await ajax({
          url: promotion.image,
          responseType: 'arraybuffer',
        });

        if (image instanceof ArrayBuffer) {
          promotion.image = URL.createObjectURL(new Blob([image]));
        }
      })();
    }
  })
    .catch(err => {
      console.log(err);
    });

  document.addEventListener('deviceready', ondeviceready);
}

async function ondeviceready() {
  const language = navigator.language.toLowerCase();
  const oldRURL = window.resolveLocalFileSystemURL;
  const {
    externalCacheDirectory, //
    externalDataDirectory,
    cacheDirectory,
    dataDirectory,
  } = cordova.file;
  let lang = 'en-us';

  iap.startConnection();
  window.root = tag(window.root);
  window.app = tag(document.body);
  window.addedFolder = [];
  window.fileClipBoard = null;
  window.restoreTheme = restoreTheme;
  window.saveInterval = null;
  window.editorManager = null;
  window.customKeyBindings = null;
  window.defaultKeyBindings = keyBindings;
  window.toastQueue = [];
  window.toast = toast;
  window.ASSETS_DIRECTORY = Url.join(cordova.file.applicationDirectory, 'www');
  window.IS_FREE_VERSION = /(free)$/.test(BuildInfo.packageName);
  window.DATA_STORAGE = externalDataDirectory || dataDirectory;
  window.CACHE_STORAGE = externalCacheDirectory || cacheDirectory;
  window.KEYBINDING_FILE = Url.join(DATA_STORAGE, '.key-bindings.json');
  window.gitRecordFile = Url.join(DATA_STORAGE, 'git/.gitfiles');
  window.gistRecordFile = Url.join(DATA_STORAGE, 'git/.gistfiles');
  window.actionStack = ActionStack();
  window.appSettings = new Settings();
  try {
    window.ANDROID_SDK_INT = await new Promise((resolve, reject) =>
      system.getAndroidVersion(resolve, reject),
    );
  } catch (error) {
    window.ANDROID_SDK_INT = parseInt(device.version);
  }
  window.DOES_SUPPORT_THEME = (() => {
    const $testEl = tag('div', {
      style: {
        height: `var(--test-height)`,
        width: `var(--test-height)`,
      },
    });
    document.body.append($testEl);
    const client = $testEl.getBoundingClientRect();

    $testEl.remove();

    if (client.height === 0) return false;
    else return true;
  })();
  window.Acode = {
    exec(key, val) {
      if (key in commands) {
        return commands[key](val);
      } else {
        return false;
      }
    },
    get exitAppMessage() {
      const numFiles = editorManager.hasUnsavedFiles();
      if (numFiles) {
        return strings['unsaved files close app'];
      }
    },
    setLoadingMessage(message) {
      document.body.setAttribute('data-small-msg', message);
    },
  };
  window.keyBindings = (name) => {
    if (customKeyBindings && name in window.customKeyBindings)
      return window.customKeyBindings[name].key;
    else if (name in defaultKeyBindings) return defaultKeyBindings[name].key;
    else return null;
  };

  system.requestPermission('android.permission.WRITE_EXTERNAL_STORAGE');
  localStorage.versionCode = BuildInfo.versionCode;
  document.body.setAttribute('data-version', 'v' + BuildInfo.version);
  Acode.setLoadingMessage('Loading settings...');

  window.resolveLocalFileSystemURL = function (url, ...args) {
    oldRURL.call(this, Url.safe(url), ...args);
  };

  if (navigator.app && typeof navigator.app.clearCache === 'function') {
    navigator.app.clearCache();
  }

  setTimeout(() => {
    if (document.body.classList.contains('loading'))
      document.body.setAttribute(
        'data-small-msg',
        'This is taking unexpectedly long time!',
      );
  }, 1000 * 10);

  if (language in constants.langList) {
    lang = language;
  }
  Acode.setLoadingMessage('Loading settings...');
  await appSettings.init(lang);

  if (localStorage.versionCode < 150) {
    localStorage.clear();
    appSettings.reset();
    window.location.reload();
  }

  Acode.setLoadingMessage('Loading custom theme...');
  document.head.append(
    tag('style', {
      id: 'custom-theme',
      textContent: helpers.jsonToCSS(
        constants.CUSTOM_THEME,
        appSettings.value.customTheme,
      ),
    }),
  );

  Acode.setLoadingMessage('Loading language...');
  try {
    const languageFile = `${ASSETS_DIRECTORY}/lang/${appSettings.value.lang}.json`;
    const fs = fsOperation(languageFile);
    const text = await fs.readFile('utf-8');
    window.strings = helpers.parseJSON(text);
  } catch (error) {
    alert('Unable to load language file.');
  }

  Acode.setLoadingMessage('Loading keybindings...');
  try {
    const fs = fsOperation(KEYBINDING_FILE);
    const content = await fs.readFile('utf-8');
    const bindings = helpers.parseJSON(content);
    if (bindings) {
      window.customKeyBindings = bindings;
    }
  } catch (error) {
    await helpers.resetKeyBindings();
  }

  Acode.setLoadingMessage('Loading editor...');
  await helpers.loadScripts(
    './js/ace/ace.js',
    './js/emmet-core.js',
    './js/ace/ext-language_tools.js',
    './js/ace/ext-code_lens.js',
    './js/ace/ext-emmet.js',
    './js/ace/ext-beautify.js',
    './js/ace/ext-modelist.js',
  );
  ace.config.set('basePath', './js/ace/');
  window.beautify = ace.require('ace/ext/beautify').beautify;
  window.modelist = ace.require('ace/ext/modelist');
  window.AceMouseEvent = ace.require('ace/mouse/mouse_event').MouseEvent;

  Acode.setLoadingMessage('Initializing GitHub...');
  await git.init();

  loadApp();
}

async function loadApp() {
  //#region declaration
  const $editMenuToggler = tag('span', {
    className: 'icon edit',
    attr: {
      style: 'font-size: 1.2em !important;',
      action: '',
    },
  });
  const $toggler = tag('span', {
    className: 'icon menu',
    attr: {
      action: 'toggle-sidebar',
    },
  });
  const $menuToggler = Icon('more_vert', 'toggle-menu');
  const $header = tile({
    type: 'header',
    text: 'Acode',
    lead: $toggler,
    tail: $menuToggler,
  });
  const $footer = tag('footer', {
    id: 'quick-tools',
    tabIndex: -1,
    onclick: quickTools.clickListener,
  });
  const $mainMenu = contextMenu({
    top: '6px',
    right: '6px',
    toggle: $menuToggler,
    transformOrigin: 'top right',
    innerHTML: () => {
      return mustache.render($_menu, strings);
    },
  });
  const $fileMenu = contextMenu({
    toggle: $editMenuToggler,
    top: '6px',
    transformOrigin: 'top right',
    innerHTML: () => {
      const file = editorManager.activeFile;
      return mustache.render(
        $_fileMenu,
        Object.assign(strings, {
          file_mode: (file.session.getMode().$id || '').split('/').pop(),
          file_encoding: file.encoding,
          file_read_only: !file.editable,
          file_info: !!file.uri,
          file_eol: file.eol,
        }),
      );
    },
  });
  const $main = tag('main');
  const $sidebar = sidenav($main, $toggler);
  const $runBtn = tag('span', {
    className: 'icon play_arrow',
    attr: {
      action: 'run-file',
    },
    onclick() {
      Acode.exec('run');
    },
    oncontextmenu() {
      Acode.exec('run-file');
    },
    style: {
      fontSize: '1.2em',
    },
  });
  const $headerToggler = tag('span', {
    className: 'floating icon keyboard_arrow_left',
    id: 'header-toggler',
  });
  const $quickToolToggler = tag('span', {
    className: 'floating icon keyboard_arrow_up',
    id: 'quicktool-toggler',
  });
  const folders = helpers.parseJSON(localStorage.folders);
  const files = helpers.parseJSON(localStorage.files) || [];
  let registeredKey = '';
  //#endregion

  actionStack.onCloseApp = () => Acode.exec('save-state');
  Acode.$menuToggler = $menuToggler;
  Acode.$editMenuToggler = $editMenuToggler;
  Acode.$headerToggler = $headerToggler;
  Acode.$quickToolToggler = $quickToolToggler;
  Acode.$runBtn = $runBtn;

  $sidebar.setAttribute('empty-msg', strings['open folder']);
  window.editorManager = EditorManager($sidebar, $header, $main);

  const fmode = appSettings.value.floatingButtonActivation;
  const activationMode = fmode === 'long tap' ? 'oncontextmenu' : 'onclick';
  $headerToggler[activationMode] = function () {
    root.classList.toggle('show-header');
    this.classList.toggle('keyboard_arrow_left');
    this.classList.toggle('keyboard_arrow_right');
  };
  $quickToolToggler[activationMode] = function () {
    Acode.exec('toggle-quick-tools');
  };

  //#region rendering
  applySettings.beforeRender();
  window.restoreTheme();
  root.append($header, $main, $footer, $headerToggler, $quickToolToggler);
  if (!appSettings.value.floatingButton) {
    root.classList.add('hide-floating-button');
  }
  applySettings.afterRender();
  //#endregion

  //#region loading-files
  Acode.setLoadingMessage('Loading files...');
  if (Array.isArray(folders)) {
    folders.forEach((folder) => openFolder(folder.url, folder.opts));
  }
  for (let file of files) {
    let text = '';
    const {
      cursorPos,
      isUnsaved,
      filename,
      type,
      uri,
      id,
      readOnly,
      mode,
      deltedFile,
    } = file;
    const render = files.length === 1 || id === localStorage.lastfile;

    try {
      const fs = fsOperation(Url.join(CACHE_STORAGE, id));
      text = await fs.readFile('utf-8');
    } catch (error) { }

    Acode.setLoadingMessage(`Loading ${filename}...`);

    if (type === 'git') {
      gitRecord.get(file.sha).then((record) => {
        if (record) {
          editorManager.addNewFile(filename, {
            type: 'git',
            text: text || record.data,
            isUnsaved: isUnsaved,
            record,
            render,
            cursorPos,
            id,
          });
        }
      });
    } else if (type === 'gist') {
      const gist = gistRecord.get(file.recordid, file.isNew);
      if (gist) {
        const gistFile = gist.files[filename];
        editorManager.addNewFile(filename, {
          type: 'gist',
          text: text || gistFile.content,
          isUnsaved,
          record: gist,
          render,
          cursorPos,
          id,
        });
      }
    } else if (uri) {
      try {
        const fs = fsOperation(uri);
        if (!text) {
          text = await fs.readFile('utf-8');
        } else if (!(await fs.exists()) && !readOnly) {
          uri = null;
          isUnsaved = true;
          dialogs.alert(
            strings.info.toUpperCase(),
            strings['file has been deleted'].replace('{file}', filename),
          );
        }

        if (text !== null) {
          editorManager.addNewFile(filename, {
            uri,
            render,
            isUnsaved,
            cursorPos,
            readOnly,
            text,
            id,
            mode,
            deltedFile,
          });
        }
      } catch (error) {
        continue;
      }
    } else {
      editorManager.addNewFile(filename, {
        render,
        isUnsaved,
        cursorPos,
        text,
        id,
      });
    }
  }
  //#endregion

  if (!editorManager.files.length) {
    editorManager.addNewFile();
  }
  onEditorUpdate();
  setTimeout(() => {
    document.body.removeAttribute('data-small-msg');
    app.classList.remove('loading', 'splash');
  }, 1000);

  //#region Add event listeners
  editorManager.onupdate = onEditorUpdate;
  app.addEventListener('click', onClickApp);
  $fileMenu.addEventListener('click', handleMenu);
  $mainMenu.addEventListener('click', handleMenu);
  $footer.addEventListener('touchstart', footerTouchStart);
  $footer.addEventListener('contextmenu', footerOnContextMenu);
  document.addEventListener('backbutton', actionStack.pop);
  document.addEventListener('keydown', handleMainKeyDown);
  document.addEventListener('keyup', handleMainKeyUp);
  document.addEventListener('menubutton', $sidebar.toggle);
  navigator.app.overrideButton('menubutton', true);
  system.setIntentHandler(intentHandler);
  $sidebar.onshow = function () {
    const activeFile = editorManager.activeFile;
    if (activeFile) editorManager.editor.blur();
  };
  document.addEventListener('pause', () => {
    Acode.exec('save-state');
  });
  document.addEventListener('resume', () => {
    Acode.exec('check-files');
  });
  //#endregion

  /**
   *
   * @param {KeyboardEvent} e
   */
  function handleMainKeyDown(e) {
    registeredKey = helpers.getCombination(e);
  }

  /**
   *
   * @param {KeyboardEvent} e
   */
  function handleMainKeyUp(e) {
    let key = helpers.getCombination(e);
    if (registeredKey && key !== registeredKey) return;

    const { editor } = editorManager;

    const isFocused = editor.textInput.getElement() === document.activeElement;
    if (key === 'escape' && (!actionStack.length || isFocused))
      e.preventDefault();
    if (actionStack.length || isFocused) return;
    for (let name in keyBindings) {
      const obj = keyBindings[name];
      const binding = (obj.key || '').toLowerCase();
      if (
        binding === key &&
        constants.COMMANDS.includes(name) &&
        'action' in obj
      )
        Acode.exec(obj.action);
    }

    registeredKey = null;
  }

  /**
   *
   * @param {MouseEvent} e
   */
  function handleMenu(e) {
    const $target = e.target;
    const action = $target.getAttribute('action');
    const value = $target.getAttribute('value');
    if (!action) return;

    if ($mainMenu.contains($target)) $mainMenu.hide();
    if ($fileMenu.contains($target)) $fileMenu.hide();
    Acode.exec(action, value);
  }

  function footerTouchStart(e) {
    arrowkeys.onTouchStart(e, $footer);
  }

  /**
   *
   * @param {MouseEvent} e
   */
  function footerOnContextMenu(e) {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    e.preventDefault();
    editorManager.editor.focus();
  }

  function onEditorUpdate(type) {
    const activeFile = editorManager.activeFile;
    const $save = $footer.querySelector('[action=save]');

    if (!$editMenuToggler.isConnected)
      $header.insertBefore($editMenuToggler, $header.lastChild);

    if (activeFile) {
      if (activeFile.isUnsaved) {
        activeFile.assocTile.classList.add('notice');
        if ($save) $save.classList.add('notice');
      } else {
        activeFile.assocTile.classList.remove('notice');
        if ($save) $save.classList.remove('notice');
      }

      editorManager.editor.setReadOnly(!activeFile.editable);

      if (type !== 'remove-file') {
        run
          .checkRunnable()
          .then((res) => {
            if (res) {
              $runBtn.setAttribute('run-file', res);
              $header.insertBefore($runBtn, $header.lastChild);
            } else {
              $runBtn.removeAttribute('run-file');
              $runBtn.remove();
            }
          })
          .catch((err) => {
            $runBtn.removeAttribute('run-file');
            $runBtn.remove();
          });
      }
    }

    Acode.exec('save-state');
  }
}

function onClickApp(e) {
  let el = e.target;
  if (el instanceof HTMLAnchorElement || checkIfInsideAncher()) {
    e.preventDefault();
    e.stopPropagation();

    system.openInBrowser(el.href);
  }

  function checkIfInsideAncher() {
    const allAs = [...tag.getAll('a')];

    for (let a of allAs) {
      if (a.contains(el)) {
        el = a;
        return true;
      }
    }

    return false;
  }
}
