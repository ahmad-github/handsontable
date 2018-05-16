import {
  addClass,
  getCaretPosition,
  getComputedStyle,
  getCssTransform,
  getScrollableElement,
  getScrollbarWidth,
  innerWidth,
  offset,
  resetCssTransform,
  setCaretPosition,
  hasVerticalScrollbar,
  hasHorizontalScrollbar
} from './../helpers/dom/element';
import autoResize from './../../lib/autoResize/autoResize';
import BaseEditor, {EditorState} from './_baseEditor';
import EventManager from './../eventManager';
import {KEY_CODES} from './../helpers/unicode';
import {isMSBrowser} from './../helpers/browser';
import {stopPropagation, stopImmediatePropagation, isImmediatePropagationStopped} from './../helpers/dom/event';

const TextEditor = BaseEditor.prototype.extend();

/**
 * @private
 * @editor TextEditor
 * @class TextEditor
 * @dependencies autoResize
 */
TextEditor.prototype.init = function() {
  var that = this;
  this.createElements();
  this.eventManager = new EventManager(this);
  this.bindEvents();
  this.autoResize = autoResize();
  this.holderZIndex = -1;

  this.instance.addHook('afterDestroy', () => {
    that.destroy();
  });
};

TextEditor.prototype.prepare = function(row, col, prop, td, originalValue, cellProperties) {
  BaseEditor.prototype.prepare.apply(this, arguments);

  if (!cellProperties.readOnly) {
    this.refreshDimensions(true);

    if (cellProperties.allowInvalid) {
      this.TEXTAREA.value = ''; // Remove an empty space from texarea (added by copyPaste plugin to make copy/paste functionality work with IME)
    }

    if (isMSBrowser()) {
      // Move textarea element out off the viewport due to the cursor overlapping bug on IE.
      this.hideEditableElement();
    }
    // @TODO: The fragmentSelection functionality is conflicted with IME. To make fragmentSelection working below is a condition which disables
    // IME when fragmentSelection is enabled
    if (!cellProperties.fragmentSelection) {
      this.instance._registerImmediate(() => this.focus());
    }
  }
};

TextEditor.prototype.hideEditableElement = function() {
  // IE and Edge have the bug where the caret of the editable elements (eg. input, texarea) is always visible
  // despite the element is overlapped by another element. To hide element we need to move element out of the viewport.
  if (isMSBrowser()) {
    this.textareaParentStyle.top = '-9999px';
    this.textareaParentStyle.left = '-9999px';
  } else {
    // For other browsers hide element under Handsontable itself.
    this.textareaParentStyle.top = '0px';
    this.textareaParentStyle.left = '0px';
  }

  this.textareaParentStyle.zIndex = '-1';
};

TextEditor.prototype.showEditableElement = function() {
  this.textareaParentStyle.zIndex = this.holderZIndex >= 0 ? this.holderZIndex : '';
};

TextEditor.prototype.getValue = function() {
  return this.TEXTAREA.value;
};

TextEditor.prototype.setValue = function(newValue) {
  this.TEXTAREA.value = newValue;
};

TextEditor.prototype.beginEditing = function(newInitialValue, event) {
  this.TEXTAREA.value = ''; // Remove an empty space from texarea (added by copyPaste plugin to make copy/paste functionality work with IME).
  BaseEditor.prototype.beginEditing.apply(this, arguments);
};

var onBeforeKeyDown = function onBeforeKeyDown(event) {
  var
    instance = this,
    that = instance.getActiveEditor(),
    ctrlDown;

  // catch CTRL but not right ALT (which in some systems triggers ALT+CTRL)
  ctrlDown = (event.ctrlKey || event.metaKey) && !event.altKey;

  // Process only events that have been fired in the editor
  if (event.target !== that.TEXTAREA || isImmediatePropagationStopped(event)) {
    return;
  }

  if (event.keyCode === 17 || event.keyCode === 224 || event.keyCode === 91 || event.keyCode === 93) {
    // when CTRL or its equivalent is pressed and cell is edited, don't prepare selectable text in textarea
    stopImmediatePropagation(event);
    return;
  }

  switch (event.keyCode) {
    case KEY_CODES.ARROW_RIGHT:
      if (that.isInFullEditMode()) {
        if ((!that.isWaiting() && !that.allowKeyEventPropagation) ||
            (!that.isWaiting() && that.allowKeyEventPropagation && !that.allowKeyEventPropagation(event.keyCode))) {
          stopImmediatePropagation(event);
        }
      }
      break;
    case KEY_CODES.ARROW_LEFT:
      if (that.isInFullEditMode()) {
        if ((!that.isWaiting() && !that.allowKeyEventPropagation) ||
            (!that.isWaiting() && that.allowKeyEventPropagation && !that.allowKeyEventPropagation(event.keyCode))) {
          stopImmediatePropagation(event);
        }
      }
      break;
    case KEY_CODES.ARROW_UP:
    case KEY_CODES.ARROW_DOWN:
      if (that.isInFullEditMode()) {
        if ((!that.isWaiting() && !that.allowKeyEventPropagation) ||
            (!that.isWaiting() && that.allowKeyEventPropagation && !that.allowKeyEventPropagation(event.keyCode))) {
          stopImmediatePropagation(event);
        }
      }
      break;

    case KEY_CODES.ENTER: {
      let isMultipleSelection = this.selection.isMultiple();

      if ((ctrlDown && !isMultipleSelection) || event.altKey) { // if ctrl+enter or alt+enter, add new line
        if (that.isOpened()) {
          let caretPosition = getCaretPosition(that.TEXTAREA);
          let value = that.getValue();
          let newValue = `${value.slice(0, caretPosition)}\n${value.slice(caretPosition)}`;

          that.setValue(newValue);

          setCaretPosition(that.TEXTAREA, caretPosition + 1);

        } else {
          that.beginEditing(`${that.originalValue}\n`);
        }
        stopImmediatePropagation(event);
      }
      event.preventDefault(); // don't add newline to field
      break;
    }
    case KEY_CODES.A:
    case KEY_CODES.X:
    case KEY_CODES.C:
    case KEY_CODES.V:
      if (ctrlDown) {
        stopImmediatePropagation(event); // CTRL+A, CTRL+C, CTRL+V, CTRL+X should only work locally when cell is edited (not in table context)
      }
      break;

    case KEY_CODES.BACKSPACE:
    case KEY_CODES.DELETE:
    case KEY_CODES.HOME:
    case KEY_CODES.END:
      stopImmediatePropagation(event); // backspace, delete, home, end should only work locally when cell is edited (not in table context)
      break;
    default:
      break;
  }

  if ([KEY_CODES.ARROW_UP, KEY_CODES.ARROW_RIGHT, KEY_CODES.ARROW_DOWN, KEY_CODES.ARROW_LEFT].indexOf(event.keyCode) === -1) {
    that.autoResize.resize(String.fromCharCode(event.keyCode));
  }
};

TextEditor.prototype.open = function() {
  this.refreshDimensions(); // need it instantly, to prevent https://github.com/handsontable/handsontable/issues/348
  this.showEditableElement();

  this.instance.addHook('beforeKeyDown', onBeforeKeyDown);
};

TextEditor.prototype.close = function(tdOutside) {
  this.autoResize.unObserve();

  if (document.activeElement === this.TEXTAREA) {
    this.instance.listen(); // don't refocus the table if user focused some cell outside of HT on purpose
  }

  this.hideEditableElement();
  this.setValue('');

  this.instance.removeHook('beforeKeyDown', onBeforeKeyDown);
};

TextEditor.prototype.focus = function() {
  // For IME editor textarea element must be focused using ".select" method. Using ".focus" browser automatically scroll into
  // the focused element which is undesire effect.
  this.TEXTAREA.select();
  setCaretPosition(this.TEXTAREA, this.TEXTAREA.value.length);
};

TextEditor.prototype.createElements = function() {
  this.TEXTAREA = document.createElement('TEXTAREA');

  addClass(this.TEXTAREA, 'handsontableInput');

  this.textareaStyle = this.TEXTAREA.style;
  this.textareaStyle.width = 0;
  this.textareaStyle.height = 0;

  this.TEXTAREA_PARENT = document.createElement('DIV');
  addClass(this.TEXTAREA_PARENT, 'handsontableInputHolder');

  this.textareaParentStyle = this.TEXTAREA_PARENT.style;
  this.textareaParentStyle.zIndex = '-1';

  this.TEXTAREA_PARENT.appendChild(this.TEXTAREA);

  this.instance.rootElement.appendChild(this.TEXTAREA_PARENT);
};

TextEditor.prototype.getEditedCell = function() {
  let editorSection = this.checkEditorSection();
  let editedCell;

  switch (editorSection) {
    case 'top':
      editedCell = this.instance.view.wt.wtOverlays.topOverlay.clone.wtTable.getCell({
        row: this.row,
        col: this.col
      });
      this.holderZIndex = 101;
      break;
    case 'top-left-corner':
      editedCell = this.instance.view.wt.wtOverlays.topLeftCornerOverlay.clone.wtTable.getCell({
        row: this.row,
        col: this.col
      });
      this.holderZIndex = 103;
      break;
    case 'bottom-left-corner':
      editedCell = this.instance.view.wt.wtOverlays.bottomLeftCornerOverlay.clone.wtTable.getCell({
        row: this.row,
        col: this.col
      });
      this.holderZIndex = 103;
      break;
    case 'left':
      editedCell = this.instance.view.wt.wtOverlays.leftOverlay.clone.wtTable.getCell({
        row: this.row,
        col: this.col
      });
      this.holderZIndex = 102;
      break;
    case 'bottom':
      editedCell = this.instance.view.wt.wtOverlays.bottomOverlay.clone.wtTable.getCell({
        row: this.row,
        col: this.col
      });
      this.holderZIndex = 102;
      break;
    default:
      editedCell = this.instance.getCell(this.row, this.col);
      this.holderZIndex = -1;
      break;
  }

  return editedCell != -1 && editedCell != -2 ? editedCell : void 0;
};

TextEditor.prototype.refreshValue = function() {
  let sourceData = this.instance.getSourceDataAtCell(this.row, this.prop);
  this.originalValue = sourceData;

  this.setValue(sourceData);
  this.refreshDimensions();
};

TextEditor.prototype.refreshDimensions = function(force = false) {
  if (this.state !== EditorState.EDITING && !force) {
    return;
  }
  this.TD = this.getEditedCell();

  // TD is outside of the viewport.
  if (!this.TD) {
    if (!force) {
      this.close(true);
    }

    return;
  }

  const currentOffset = offset(this.TD);
  const containerOffset = offset(this.instance.rootElement);
  const scrollableContainer = this.instance.view.wt.wtOverlays.topOverlay.mainTableScrollableElement;
  const totalRowsCount = this.instance.countRows();
  const containerScrollTop = scrollableContainer !== window ?
    scrollableContainer.scrollTop : 0;
  const containerScrollLeft = scrollableContainer !== window ?
    scrollableContainer.scrollLeft : 0;

  const editorSection = this.checkEditorSection();

  const scrollTop = ['', 'left'].includes(editorSection) ? containerScrollTop : 0;
  const scrollLeft = ['', 'top', 'bottom'].includes(editorSection) ? containerScrollLeft : 0;

  // If colHeaders is disabled, cells in the first row have border-top
  const editTopModifier = currentOffset.top === containerOffset.top ? 0 : 1;

  const settings = this.instance.getSettings();
  const rowHeadersCount = this.instance.hasRowHeaders();
  const colHeadersCount = this.instance.hasColHeaders();
  const backgroundColor = this.TD.style.backgroundColor;

  let editTop = currentOffset.top - containerOffset.top - editTopModifier - scrollTop;
  let editLeft = currentOffset.left - containerOffset.left - 1 - scrollLeft;
  let cssTransformOffset;

  // TODO: Refactor this to the new instance.getCell method (from #ply-59), after 0.12.1 is released
  switch (editorSection) {
    case 'top':
      cssTransformOffset = getCssTransform(this.instance.view.wt.wtOverlays.topOverlay.clone.wtTable.holder.parentNode);
      break;
    case 'left':
      cssTransformOffset = getCssTransform(this.instance.view.wt.wtOverlays.leftOverlay.clone.wtTable.holder.parentNode);
      break;
    case 'top-left-corner':
      cssTransformOffset = getCssTransform(this.instance.view.wt.wtOverlays.topLeftCornerOverlay.clone.wtTable.holder.parentNode);
      break;
    case 'bottom-left-corner':
      cssTransformOffset = getCssTransform(this.instance.view.wt.wtOverlays.bottomLeftCornerOverlay.clone.wtTable.holder.parentNode);
      break;
    case 'bottom':
      cssTransformOffset = getCssTransform(this.instance.view.wt.wtOverlays.bottomOverlay.clone.wtTable.holder.parentNode);
      break;
    default:
      break;
  }

  if (colHeadersCount && this.instance.getSelectedLast()[0] === 0 ||
      (settings.fixedRowsBottom && this.instance.getSelectedLast()[0] === totalRowsCount - settings.fixedRowsBottom)) {
    editTop += 1;
  }

  if (this.instance.getSelectedLast()[1] === 0) {
    editLeft += 1;
  }

  if (cssTransformOffset && cssTransformOffset != -1) {
    this.textareaParentStyle[cssTransformOffset[0]] = cssTransformOffset[1];
  } else {
    resetCssTransform(this.TEXTAREA_PARENT);
  }

  this.textareaParentStyle.top = `${editTop}px`;
  this.textareaParentStyle.left = `${editLeft}px`;

  let firstRowOffset = this.instance.view.wt.wtViewport.rowsRenderCalculator.startPosition;
  let firstColumnOffset = this.instance.view.wt.wtViewport.columnsRenderCalculator.startPosition;
  let horizontalScrollPosition = this.instance.view.wt.wtOverlays.leftOverlay.getScrollPosition();
  let verticalScrollPosition = this.instance.view.wt.wtOverlays.topOverlay.getScrollPosition();
  let scrollbarWidth = getScrollbarWidth();

  let cellTopOffset = this.TD.offsetTop + firstRowOffset - verticalScrollPosition;
  let cellLeftOffset = this.TD.offsetLeft + firstColumnOffset - horizontalScrollPosition;

  let width = innerWidth(this.TD) - 8;
  let actualVerticalScrollbarWidth = hasVerticalScrollbar(scrollableContainer) ? scrollbarWidth : 0;
  let actualHorizontalScrollbarWidth = hasHorizontalScrollbar(scrollableContainer) ? scrollbarWidth : 0;
  let maxWidth = this.instance.view.maximumVisibleElementWidth(cellLeftOffset) - 9 - actualVerticalScrollbarWidth;
  let height = this.TD.scrollHeight + 1;
  let maxHeight = Math.max(this.instance.view.maximumVisibleElementHeight(cellTopOffset) - actualHorizontalScrollbarWidth, 23);

  const cellComputedStyle = getComputedStyle(this.TD);

  this.TEXTAREA.style.fontSize = cellComputedStyle.fontSize;
  this.TEXTAREA.style.fontFamily = cellComputedStyle.fontFamily;
  this.TEXTAREA.style.backgroundColor = backgroundColor ? backgroundColor : getComputedStyle(this.TEXTAREA).backgroundColor;

  this.autoResize.init(this.TEXTAREA, {
    minHeight: Math.min(height, maxHeight),
    maxHeight, // TEXTAREA should never be wider than visible part of the viewport (should not cover the scrollbar)
    minWidth: Math.min(width, maxWidth),
    maxWidth // TEXTAREA should never be wider than visible part of the viewport (should not cover the scrollbar)
  }, true);
};

TextEditor.prototype.bindEvents = function() {
  var editor = this;

  this.eventManager.addEventListener(this.TEXTAREA, 'cut', (event) => {
    stopPropagation(event);
  });
  this.eventManager.addEventListener(this.TEXTAREA, 'paste', (event) => {
    stopPropagation(event);
  });

  this.instance.addHook('afterScrollHorizontally', () => {
    editor.refreshDimensions();
  });

  this.instance.addHook('afterScrollVertically', () => {
    editor.refreshDimensions();
  });

  this.instance.addHook('afterColumnResize', () => {
    editor.refreshDimensions();
    editor.focus();
  });

  this.instance.addHook('afterRowResize', () => {
    editor.refreshDimensions();
    editor.focus();
  });

  this.instance.addHook('afterDestroy', () => {
    editor.eventManager.destroy();
  });
};

TextEditor.prototype.destroy = function() {
  this.eventManager.destroy();
};

export default TextEditor;
