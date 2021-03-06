/* @fileoverview 
 * Provides full bootstrap based, multi-instance WYSIWYG editor.
 * 
 * "Name"    = 'bootstrap-wysiwyg'
 * "Author"  = 'Various, see LICENCE'
 * "Version" = '1.0.2'
 * "About"   = 'Tiny Bootstrap and JQuery Based WISWYG rich text editor.' 
 */
(function ($) {
	'use strict';
	/** underscoreThrottle() 
	 * 	From underscore http://underscorejs.org/docs/underscore.html 
	 */
	var underscoreThrottle = function(func, wait) {
		var context, args, timeout, result;
		var previous = 0;
		var later = function() {
			previous = new Date;
			timeout = null;
			result = func.apply(context, args);
		};
		return function() {
			var now = new Date;
			var remaining = wait - (now - previous);
			context = this;
			args = arguments;
			if (remaining <= 0) {
				clearTimeout(timeout);
				timeout = null;
				previous = now;
				result = func.apply(context, args);
			} else if (!timeout) {
				timeout = setTimeout(later, remaining);
			}
			return result;
		};
	}
	var readFileIntoDataUrl = function (fileInfo) {
		var loader = $.Deferred(),
			fReader = new FileReader();
		fReader.onload = function (e) {
			loader.resolve(e.target.result);
		};
		fReader.onerror = loader.reject;
		fReader.onprogress = loader.notify;
		fReader.readAsDataURL(fileInfo);
		return loader.promise();
	};
	$.fn.cleanHtml = function () {
		var html = $(this).html();
		return html && html.replace(/(<br>|\s|<div><br><\/div>|&nbsp;)*$/, '');
	};
	$.fn.wysiwyg = function (userOptions) {
		var editor = this,
			wrapper = $(editor).parent(),
			selectedRange,
			options,
			toolbarBtnSelector,
			updateToolbar = function () {
				if (options.activeToolbarClass) {
					$(options.toolbarSelector,wrapper).find(toolbarBtnSelector).each(underscoreThrottle(function () {
						var commandArr = $(this).data(options.commandRole).split(' '),
							command = commandArr[0];

						// If the command has an argument and its value matches this button. == used for string/number comparison
						if (commandArr.length > 1 && document.queryCommandEnabled(command) && document.queryCommandValue(command) == commandArr[1]) {
							$(this).addClass(options.activeToolbarClass);
						// Else if the command has no arguments and it is active
						} else if (commandArr.length === 1 && document.queryCommandEnabled(command) && document.queryCommandState(command)) {
							$(this).addClass(options.activeToolbarClass);
						// Else the command is not active
						} else {
							$(this).removeClass(options.activeToolbarClass);
						}
					}, options.keypressTimeout));
				}
			},
			execCommand = function (commandWithArgs, valueArg) {
				var commandArr = commandWithArgs.split(' '),
					command = commandArr.shift(),
					args = commandArr.join(' ') + (valueArg || '');
				document.execCommand(command, 0, args);
				updateToolbar();
			},
			bindHotkeys = function (hotKeys) {
				$.each(hotKeys, function (hotkey, command) {
					editor.keydown(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
							execCommand(command);
						}
					}).keyup(hotkey, function (e) {
						if (editor.attr('contenteditable') && editor.is(':visible')) {
							e.preventDefault();
							e.stopPropagation();
						}
					});
				});
			},
			getCurrentRange = function () {
                var sel, range;
                if (window.getSelection) {
                    sel = window.getSelection();
                    if (sel.getRangeAt && sel.rangeCount) {
                        range = sel.getRangeAt(0);
				    }
                } else if (document.selection) {
                    range = document.selection.createRange();
                } return range;
			},
			saveSelection = function () {
				selectedRange = getCurrentRange();
			},
			restoreSelection = function () {
				var selection;
                if (window.getSelection || document.createRange) {
                    selection = window.getSelection();
                    if (selectedRange) {
                        try {
                            selection.removeAllRanges();
                        } catch (ex) {
                            document.body.createTextRange().select();
                            document.selection.empty();
                        }
                        selection.addRange(selectedRange);
                    }
                } 
                else if (document.selection && selectedRange) {
                	selectedRange.select()
                }
			},
			insertFiles = function (files) {
				editor.focus();
				$.each(files, function (idx, fileInfo) {
					if (/^image\//.test(fileInfo.type)) {
						$.when(readFileIntoDataUrl(fileInfo)).done(function (dataUrl) {
							execCommand('insertimage', dataUrl);
							editor.trigger('image-inserted');
						}).fail(function (e) {
							options.fileUploadError("file-reader", e);
						});
					} else {
						options.fileUploadError("unsupported-file-type", fileInfo.type);
					}
				});
			},
			markSelection = function (input, color) {
				restoreSelection();
				if (document.queryCommandSupported('hiliteColor')) {
					document.execCommand('hiliteColor', 0, color || 'transparent');
				}
				saveSelection();
				input.data(options.selectionMarker, color);
			},
			bindToolbar = function (toolbar, options) {
				toolbar.find(toolbarBtnSelector, wrapper).click(function () {
					restoreSelection();
					editor.focus();
					execCommand($(this).data(options.commandRole));
					saveSelection();
				});
				toolbar.find('[data-toggle=dropdown]').click(restoreSelection);

				toolbar.find('input[type=text][data-' + options.commandRole + ']').on('webkitspeechchange change', function () {
					var newValue = this.value; /* ugly but prevents fake double-calls due to selection restoration */
					this.value = '';
					restoreSelection();
					if (newValue) {
						editor.focus();
						execCommand($(this).data(options.commandRole), newValue);
					}
					saveSelection();
				}).on('focus', function () {
					var input = $(this);
					if (!input.data(options.selectionMarker)) {
						markSelection(input, options.selectionColor);
						input.focus();
					}
				}).on('blur', function () {
					var input = $(this);
					if (input.data(options.selectionMarker)) {
						markSelection(input, false);
					}
				});
				toolbar.find('input[type=file][data-' + options.commandRole + ']').change(function () {
					restoreSelection();
					if (this.type === 'file' && this.files && this.files.length > 0) {
						insertFiles(this.files);
					}
					saveSelection();
					this.value = '';
				});
			},
			initFileDrops = function () {
				editor.on('dragenter dragover', false)
					.on('drop', function (e) {
						var dataTransfer = e.originalEvent.dataTransfer;
						e.stopPropagation();
						e.preventDefault();
						if (dataTransfer && dataTransfer.files && dataTransfer.files.length > 0) {
							insertFiles(dataTransfer.files);
						}
					});
			};
		options = $.extend(true, {}, $.fn.wysiwyg.defaults, userOptions);
		toolbarBtnSelector = 'a[data-' + options.commandRole + '],button[data-' + options.commandRole + '],input[type=button][data-' + options.commandRole + ']';
		bindHotkeys(options.hotKeys);
		
		// Support placeholder attribute on the DIV
		if ($(this).attr('placeholder') != '') {
			$(this).addClass('placeholderText');
			$(this).html($(this).attr('placeholder'));
			$(this).bind('focus',function(e) {
				if ( $(this).attr('placeholder') != '' && $(this).text() == $(this).attr('placeholder') ) {
					$(this).removeClass('placeholderText');
					$(this).html('');
				}
			});
			$(this).bind('blur',function(e) {
				if ( $(this).attr('placeholder') != '' && $(this).text() == '' ) {
					$(this).addClass('placeholderText');
					$(this).html($(this).attr('placeholder'));
				}
			})
		}
		
		if (options.dragAndDropImages) {
			initFileDrops();
		}
		bindToolbar($(options.toolbarSelector), options);
		editor.attr('contenteditable', true)
			.on('mouseup keyup mouseout', function () {
				saveSelection();
				updateToolbar();
			});
		$(window).bind('touchend', function (e) {
			var isInside = (editor.is(e.target) || editor.has(e.target).length > 0),
				currentRange = getCurrentRange(),
				clear = currentRange && (currentRange.startContainer === currentRange.endContainer && currentRange.startOffset === currentRange.endOffset);
			if (!clear || isInside) {
				saveSelection();
				updateToolbar();
			}
		});
		return this;
	};
	$.fn.wysiwyg.defaults = {
		hotKeys: {
			'Ctrl+b meta+b': 'bold',
			'Ctrl+i meta+i': 'italic',
			'Ctrl+u meta+u': 'underline',
			'Ctrl+z': 'undo',
			'Ctrl+y meta+y meta+shift+z': 'redo',
			'Ctrl+l meta+l': 'justifyleft',
			'Ctrl+r meta+r': 'justifyright',
			'Ctrl+e meta+e': 'justifycenter',
			'Ctrl+j meta+j': 'justifyfull',
			'Shift+tab': 'outdent',
			'tab': 'indent'
		},
		toolbarSelector: '[data-role=editor-toolbar]',
		commandRole: 'edit',
		activeToolbarClass: 'btn-info',
		selectionMarker: 'edit-focus-marker',
		selectionColor: 'darkgrey',
		dragAndDropImages: true,
		keypressTimeout: 200,
		fileUploadError: function (reason, detail) { console.log("File upload error", reason, detail); }
	};
}(window.jQuery));