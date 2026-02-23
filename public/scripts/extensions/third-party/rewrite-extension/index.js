import { sendOpenAIRequest, oai_settings } from "../../../openai.js";
import { extractAllWords } from "../../../utils.js";
import { getTokenCount } from "../../../tokenizers.js";
import { getNovelGenerationData, generateNovelWithStreaming, nai_settings } from "../../../nai-settings.js";
import { generateHorde, MIN_LENGTH } from "../../../horde.js";
import { getTextGenGenerationData, generateTextGenWithStreaming } from "../../../textgen-settings.js";
import {
    main_api,
    novelai_settings,
    novelai_setting_names,
    eventSource,
    event_types,
    saveSettingsDebounced,
    messageFormatting,
    addCopyToCodeBlocks,
    getRequestHeaders,
    generateRaw,
} from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";
import { getRegexedString, regex_placement } from '../../regex/engine.js'; // Import from built-in regex extension

const extensionName = "rewrite-extension";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const undo_steps = 15;

// Default settings
const defaultSettings = {
    rewritePreset: "",
    shortenPreset: "",
    expandPreset: "",
    customPreset: "", 
    rewriteLabel: "Rewrite",
    shortenLabel: "Shorten",
    expandLabel: "Expand",
    customLabel: "Custom",
    extra1Label: "Option 1",
    extra2Label: "Option 2",
    extra3Label: "Option 3",
    extra4Label: "Option 4",
    extra5Label: "Option 5",
    extra6Label: "Option 6",
    extra7Label: "Option 7",
    extra8Label: "Option 8",
    extra9Label: "Option 9",
    extra10Label: "Option 10",
    textExtra1Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra2Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra3Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra4Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra5Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra6Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra7Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra8Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra9Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    textExtra10Prompt: "[INST]Rewrite this section of text: \"\"\"{{rewrite}}\"\"\". Follow these instructions carefully.[/INST]\n\nSure, here is only the rewritten text without any comments: ",
    showExtra1: true,
    showExtra2: true,
    showExtra3: true,
    showExtra4: true,
    showExtra5: true,
    showExtra6: true,
    showExtra7: true,
    showExtra8: true,
    showExtra9: true,
    showExtra10: true,
    selectedModel: "chat_completion",
    textRewritePrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style and length. Do not list alternatives and only print the result without prefix or suffix.[/INST]

Sure, here is only the rewritten text without any comments: `,
    textShortenPrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Shorten it by roughly 20%.[/INST]

Sure, here is only the rewritten text without any comments: `,
    textExpandPrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" while keeping the same content, general style. Do not list alternatives and only print the result without prefix or suffix. Lengthen it by roughly 20%.[/INST]

Sure, here is only the rewritten text without any comments: `,
    textCustomPrompt: `[INST]Rewrite this section of text: """{{rewrite}}""" according to the following instructions: "{{custom_instructions}}". Keep the general style. Do not list alternatives and only print the result without prefix or suffix.[/INST]

Sure, here is only the rewritten text without any comments: `, 
    useStreaming: true,
    removePrefix: `"`,
    removeSuffix: `"`,
    overrideMaxTokens: true,
    showRewrite: true,
    showShorten: true,
    showExpand: true,
    showCustom: true, 
    showDelete: true,
    applyRegexOnRewrite: true, // New setting to control regex application
    optionOrder: ['rewrite', 'shorten', 'expand', 'extra1', 'extra2', 'extra3', 'extra4', 'extra5', 'extra6', 'extra7', 'extra8', 'extra9', 'extra10'],
};

let rewriteMenu = null;
let lastSelection = null;
let abortController;
let activeInlinePreview = null;

let changeHistory = [];

// Load settings
function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    // Helper function to get a setting with a default value
    const getSetting = (key, defaultValue) => {
        return extension_settings[extensionName][key] !== undefined
            ? extension_settings[extensionName][key]
            : defaultValue;
    };

    // Load settings, using defaults if not set
    $("#rewrite_preset").val(getSetting('rewritePreset', defaultSettings.rewritePreset));
    $("#shorten_preset").val(getSetting('shortenPreset', defaultSettings.shortenPreset));
    $("#expand_preset").val(getSetting('expandPreset', defaultSettings.expandPreset));
    $("#custom_preset").val(getSetting('customPreset', defaultSettings.customPreset)); 
    $("#rewrite_extension_model_select").val(getSetting('selectedModel', defaultSettings.selectedModel));
    $("#text_rewrite_prompt").val(getSetting('textRewritePrompt', defaultSettings.textRewritePrompt));
    $("#text_shorten_prompt").val(getSetting('textShortenPrompt', defaultSettings.textShortenPrompt));
    $("#text_expand_prompt").val(getSetting('textExpandPrompt', defaultSettings.textExpandPrompt));
    $("#text_custom_prompt").val(getSetting('textCustomPrompt', defaultSettings.textCustomPrompt)); 
    $("#use_streaming").prop('checked', getSetting('useStreaming', defaultSettings.useStreaming));
    $("#remove_prefix").val(getSetting('removePrefix', defaultSettings.removePrefix));
    $("#remove_suffix").val(getSetting('removeSuffix', defaultSettings.removeSuffix));
    $("#override_max_tokens").prop('checked', getSetting('overrideMaxTokens', defaultSettings.overrideMaxTokens));
    $("#show_rewrite").prop('checked', getSetting('showRewrite', defaultSettings.showRewrite));
    $("#show_shorten").prop('checked', getSetting('showShorten', defaultSettings.showShorten));
    $("#show_expand").prop('checked', getSetting('showExpand', defaultSettings.showExpand));
    $("#show_custom").prop('checked', getSetting('showCustom', defaultSettings.showCustom)); 
    $("#rewrite_label").val(getSetting('rewriteLabel', defaultSettings.rewriteLabel));
    $("#shorten_label").val(getSetting('shortenLabel', defaultSettings.shortenLabel));
    $("#expand_label").val(getSetting('expandLabel', defaultSettings.expandLabel));
    $("#custom_label").val(getSetting('customLabel', defaultSettings.customLabel));
    $("#extra10_label").val(getSetting('extra10Label', defaultSettings.extra10Label));
    $("#text_extra10_prompt").val(getSetting('textExtra10Prompt', defaultSettings.textExtra10Prompt));
    $("#show_extra10").prop('checked', getSetting('showExtra10', defaultSettings.showExtra10));
    $("#extra9_label").val(getSetting('extra9Label', defaultSettings.extra9Label));
    $("#text_extra9_prompt").val(getSetting('textExtra9Prompt', defaultSettings.textExtra9Prompt));
    $("#show_extra9").prop('checked', getSetting('showExtra9', defaultSettings.showExtra9));
    $("#extra8_label").val(getSetting('extra8Label', defaultSettings.extra8Label));
    $("#text_extra8_prompt").val(getSetting('textExtra8Prompt', defaultSettings.textExtra8Prompt));
    $("#show_extra8").prop('checked', getSetting('showExtra8', defaultSettings.showExtra8));
    $("#extra7_label").val(getSetting('extra7Label', defaultSettings.extra7Label));
    $("#text_extra7_prompt").val(getSetting('textExtra7Prompt', defaultSettings.textExtra7Prompt));
    $("#show_extra7").prop('checked', getSetting('showExtra7', defaultSettings.showExtra7));
    $("#extra6_label").val(getSetting('extra6Label', defaultSettings.extra6Label));
    $("#text_extra6_prompt").val(getSetting('textExtra6Prompt', defaultSettings.textExtra6Prompt));
    $("#show_extra6").prop('checked', getSetting('showExtra6', defaultSettings.showExtra6));
    $("#extra5_label").val(getSetting('extra5Label', defaultSettings.extra5Label));
    $("#text_extra5_prompt").val(getSetting('textExtra5Prompt', defaultSettings.textExtra5Prompt));
    $("#show_extra5").prop('checked', getSetting('showExtra5', defaultSettings.showExtra5));
    $("#extra4_label").val(getSetting('extra4Label', defaultSettings.extra4Label));
    $("#text_extra4_prompt").val(getSetting('textExtra4Prompt', defaultSettings.textExtra4Prompt));
    $("#show_extra4").prop('checked', getSetting('showExtra4', defaultSettings.showExtra4));
    $("#extra3_label").val(getSetting('extra3Label', defaultSettings.extra3Label));
    $("#text_extra3_prompt").val(getSetting('textExtra3Prompt', defaultSettings.textExtra3Prompt));
    $("#show_extra3").prop('checked', getSetting('showExtra3', defaultSettings.showExtra3));
    $("#extra2_label").val(getSetting('extra2Label', defaultSettings.extra2Label));
    $("#text_extra2_prompt").val(getSetting('textExtra2Prompt', defaultSettings.textExtra2Prompt));
    $("#show_extra2").prop('checked', getSetting('showExtra2', defaultSettings.showExtra2));
    $("#extra1_label").val(getSetting('extra1Label', defaultSettings.extra1Label));
    $("#text_extra1_prompt").val(getSetting('textExtra1Prompt', defaultSettings.textExtra1Prompt));
    $("#show_extra1").prop('checked', getSetting('showExtra1', defaultSettings.showExtra1));
    $("#show_delete").prop('checked', getSetting('showDelete', defaultSettings.showDelete));
    $("#apply_regex_on_rewrite").prop('checked', getSetting('applyRegexOnRewrite', defaultSettings.applyRegexOnRewrite)); // Load new setting

    applyOptionOrderToSettingsWidgets(getSetting('optionOrder', defaultSettings.optionOrder));

    // Update the UI based on loaded settings
    updateModelSettings();
}

function saveSettings() {
    extension_settings[extensionName] = {
        rewritePreset: $("#rewrite_preset").val(),
        shortenPreset: $("#shorten_preset").val(),
        expandPreset: $("#expand_preset").val(),
        customPreset: $("#custom_preset").val(), 
        selectedModel: $("#rewrite_extension_model_select").val(),
        textRewritePrompt: $("#text_rewrite_prompt").val(),
        textShortenPrompt: $("#text_shorten_prompt").val(),
        textExpandPrompt: $("#text_expand_prompt").val(),
        textCustomPrompt: $("#text_custom_prompt").val(), 
        useStreaming: $("#use_streaming").is(':checked'),
        removePrefix: $("#remove_prefix").val(),
        removeSuffix: $("#remove_suffix").val(),
        overrideMaxTokens: $("#override_max_tokens").is(':checked'),
        showRewrite: $("#show_rewrite").is(':checked'),
        showShorten: $("#show_shorten").is(':checked'),
        showExpand: $("#show_expand").is(':checked'),
        showCustom: $("#show_custom").is(':checked'), 
        rewriteLabel: $("#rewrite_label").val(),
        shortenLabel: $("#shorten_label").val(),
        expandLabel: $("#expand_label").val(),
        customLabel: $("#custom_label").val().trim() || defaultSettings.customLabel,
        extra10Label: $("#extra10_label").val(),
        textExtra10Prompt: $("#text_extra10_prompt").val(),
        showExtra10: $("#show_extra10").is(':checked'),
        extra9Label: $("#extra9_label").val(),
        textExtra9Prompt: $("#text_extra9_prompt").val(),
        showExtra9: $("#show_extra9").is(':checked'),
        extra8Label: $("#extra8_label").val(),
        textExtra8Prompt: $("#text_extra8_prompt").val(),
        showExtra8: $("#show_extra8").is(':checked'),
        extra7Label: $("#extra7_label").val(),
        textExtra7Prompt: $("#text_extra7_prompt").val(),
        showExtra7: $("#show_extra7").is(':checked'),
        extra6Label: $("#extra6_label").val(),
        textExtra6Prompt: $("#text_extra6_prompt").val(),
        showExtra6: $("#show_extra6").is(':checked'),
        extra5Label: $("#extra5_label").val(),
        textExtra5Prompt: $("#text_extra5_prompt").val(),
        showExtra5: $("#show_extra5").is(':checked'),
        extra4Label: $("#extra4_label").val(),
        textExtra4Prompt: $("#text_extra4_prompt").val(),
        showExtra4: $("#show_extra4").is(':checked'),
        extra3Label: $("#extra3_label").val(),
        textExtra3Prompt: $("#text_extra3_prompt").val(),
        showExtra3: $("#show_extra3").is(':checked'),
        extra2Label: $("#extra2_label").val(),
        textExtra2Prompt: $("#text_extra2_prompt").val(),
        showExtra2: $("#show_extra2").is(':checked'),
        extra1Label: $("#extra1_label").val(),
        textExtra1Prompt: $("#text_extra1_prompt").val(),
        showExtra1: $("#show_extra1").is(':checked'),
        showDelete: $("#show_delete").is(':checked'),
        applyRegexOnRewrite: $("#apply_regex_on_rewrite").is(':checked'), // Save new setting
        optionOrder: getOptionOrderFromSettingsWidgets(),
    };

    // Ensure all settings have a value, using defaults if necessary
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (extension_settings[extensionName][key] === undefined) {
            extension_settings[extensionName][key] = value;
        }
    }

    saveSettingsDebounced();
}

// Populate dropdowns
async function populateDropdowns() {
    const result = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getContext().getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (result.ok) {
        const data = await result.json();
        const presets = data.openai_setting_names;
        const dropdowns = ['rewrite_preset', 'shorten_preset', 'expand_preset', 'custom_preset']; // Added custom_preset
        dropdowns.forEach(dropdown => {
            const select = $(`#${dropdown}`);
            select.empty();
            presets.forEach(preset => {
                select.append($('<option>', {
                    value: preset,
                    text: preset
                }));
            });
        });

        // Set the selected values after populating
        loadSettings();
    }
}

function updateModelSettings() {
    const modelSelect = document.getElementById('rewrite_extension_model_select');
    const chatCompletionSettings = document.getElementById('chat_completion_settings');
    const textBasedSettings = document.getElementById('text_based_settings');

    if (modelSelect.value === 'chat_completion') {
        chatCompletionSettings.style.display = 'block';
        textBasedSettings.style.display = 'none';
    } else {
        chatCompletionSettings.style.display = 'none';
        textBasedSettings.style.display = 'block';
    }
}

function getOptionOrderFromSettingsWidgets() {
    const order = [];
    $('#rewrite_option_widgets .rewrite-option-widget').each(function () {
        const optionKey = $(this).data('optionKey');
        if (optionKey && optionKey !== 'custom') {
            order.push(optionKey);
        }
    });

    return order.length ? order : [...defaultSettings.optionOrder];
}

function applyOptionOrderToSettingsWidgets(optionOrder) {
    const validOrder = Array.isArray(optionOrder) ? optionOrder : defaultSettings.optionOrder;
    const container = $('#rewrite_option_widgets');

    validOrder.forEach(key => {
        const widget = container.children(`.rewrite-option-widget[data-option-key="${key}"]`);
        if (widget.length && key !== 'custom') {
            container.append(widget);
        }
    });

    const customWidget = container.children('.rewrite-option-widget[data-option-key="custom"]');
    if (customWidget.length) {
        container.append(customWidget);
    }
}

function initOptionOrderSorting() {
    const container = $('#rewrite_option_widgets');
    if (!container.length) {
        return;
    }

    if (container.sortable('instance') !== undefined) {
        container.sortable('destroy');
    }

    container.sortable({
        handle: '.drag-handle',
        cancel: '.rewrite-option-widget[data-option-key="custom"]',
        update: () => {
            const customWidget = container.children('.rewrite-option-widget[data-option-key="custom"]');
            if (customWidget.length) {
                container.append(customWidget);
            }
            saveSettings();
        },
    });
}

function getOrderedContextMenuOptions() {
    const optionLookup = {
        rewrite: { key: 'rewrite', name: extension_settings[extensionName].rewriteLabel || defaultSettings.rewriteLabel, show: extension_settings[extensionName].showRewrite },
        shorten: { key: 'shorten', name: extension_settings[extensionName].shortenLabel || defaultSettings.shortenLabel, show: extension_settings[extensionName].showShorten },
        expand: { key: 'expand', name: extension_settings[extensionName].expandLabel || defaultSettings.expandLabel, show: extension_settings[extensionName].showExpand },
        custom: { key: 'custom', name: extension_settings[extensionName].customLabel || defaultSettings.customLabel, show: extension_settings[extensionName].showCustom },
        extra1: { key: 'extra1', name: extension_settings[extensionName].extra1Label || defaultSettings.extra1Label, show: extension_settings[extensionName].showExtra1 },
        extra2: { key: 'extra2', name: extension_settings[extensionName].extra2Label || defaultSettings.extra2Label, show: extension_settings[extensionName].showExtra2 },
        extra3: { key: 'extra3', name: extension_settings[extensionName].extra3Label || defaultSettings.extra3Label, show: extension_settings[extensionName].showExtra3 },
        extra4: { key: 'extra4', name: extension_settings[extensionName].extra4Label || defaultSettings.extra4Label, show: extension_settings[extensionName].showExtra4 },
        extra5: { key: 'extra5', name: extension_settings[extensionName].extra5Label || defaultSettings.extra5Label, show: extension_settings[extensionName].showExtra5 },
        extra6: { key: 'extra6', name: extension_settings[extensionName].extra6Label || defaultSettings.extra6Label, show: extension_settings[extensionName].showExtra6 },
        extra7: { key: 'extra7', name: extension_settings[extensionName].extra7Label || defaultSettings.extra7Label, show: extension_settings[extensionName].showExtra7 },
        extra8: { key: 'extra8', name: extension_settings[extensionName].extra8Label || defaultSettings.extra8Label, show: extension_settings[extensionName].showExtra8 },
        extra9: { key: 'extra9', name: extension_settings[extensionName].extra9Label || defaultSettings.extra9Label, show: extension_settings[extensionName].showExtra9 },
        extra10: { key: 'extra10', name: extension_settings[extensionName].extra10Label || defaultSettings.extra10Label, show: extension_settings[extensionName].showExtra10 },
    };

    const orderedKeys = extension_settings[extensionName].optionOrder || defaultSettings.optionOrder;
    const orderedOptions = orderedKeys
        .map(key => optionLookup[key])
        .filter(Boolean);

    const customOption = optionLookup.custom;
    const nonCustomOrdered = orderedOptions.filter(option => option.key !== 'custom');

    return [
        ...nonCustomOrdered,
        customOption,
        { key: 'delete', name: 'Delete', show: extension_settings[extensionName].showDelete },
    ];
}

// Initialize
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/rewrite_settings.html`);
    $("#extensions_settings2").append(settingsHtml);

    initOptionOrderSorting();

    // Populate dropdowns
    await populateDropdowns();

    // Add event listeners
    $(".rewrite-extension-settings select").on("change", saveSettings);
    $("#use_streaming").on("change", saveSettings);
    $("#text_rewrite_prompt, #text_shorten_prompt, #text_expand_prompt, #text_custom_prompt, #text_extra1_prompt, #text_extra2_prompt, #text_extra3_prompt, #text_extra4_prompt, #text_extra5_prompt, #text_extra6_prompt, #text_extra7_prompt, #text_extra8_prompt, #text_extra9_prompt, #text_extra10_prompt, #extra1_label, #extra2_label, #extra3_label, #extra4_label, #extra5_label, #extra6_label, #extra7_label, #extra8_label, #extra9_label, #extra10_label, #rewrite_label, #shorten_label, #expand_label, #custom_label, #remove_prefix, #remove_suffix").on("input change", saveSettings);
    $("#override_max_tokens").on("change", saveSettings);
    $("#show_rewrite, #show_shorten, #show_expand, #show_custom, #show_extra1, #show_extra2, #show_extra3, #show_extra4, #show_extra5, #show_extra6, #show_extra7, #show_extra8, #show_extra9, #show_extra10, #show_delete").on("change", saveSettings); // Added #show_custom
    $("#apply_regex_on_rewrite").on("change", saveSettings); // Add listener for new checkbox

    $("#rewrite_extension_model_select").on("change", () => {
        updateModelSettings();
        saveSettings();
    });

    // Load settings
    loadSettings();

    // Add event listener for SETTINGS_UPDATED
    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        populateDropdowns();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        changeHistory = [];
        updateUndoButtons();
    });

    eventSource.on(event_types.MESSAGE_EDITED, (editedMesId) => {
        removeUndoButton(editedMesId);
    });

    updateModelSettings();
});

// Initialize the rewrite menu functionality
initRewriteMenu();

function initRewriteMenu() {
    // document.addEventListener('mouseup', handleSelectionEnd);
    // document.addEventListener('touchend', handleSelectionEnd);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mousedown', hideMenuOnOutsideClick);
    document.addEventListener('touchstart', hideMenuOnOutsideClick);

    let chatContainer = document.getElementById('chat');
    chatContainer.addEventListener('scroll', positionMenu);

    $('#mes_stop').on('click', handleStopRewrite);
}

function handleStopRewrite() {
    if (abortController) {
        abortController.abort();
        // Restore the original settings
        if (abortController.signal.prev_oai_settings) {
            Object.assign(oai_settings, abortController.signal.prev_oai_settings);
        }

        getContext().activateSendButtons();

    }
}

// function handleSelectionEnd(e) {
//     if (e.target && e.target.closest('.ctx-menu')) return;
//     removeRewriteMenu();
//     setTimeout(processSelection, 50);
// }

function handleSelectionChange() {
    // Use a small timeout to ensure the selection has been updated
    setTimeout(processSelection, 50);
}

function processSelection() {
    if (activeInlinePreview) {
        return;
    }

    // First, check if getContext().chatId is defined
    if (getContext().chatId === undefined) {
        return; // Exit the function if chatId is undefined
    }

    let selection = window.getSelection();
    let selectedText = selection.toString().trim();

    // Always remove the existing menu first
    removeRewriteMenu();

    if (selectedText.length > 0) {
        let range = selection.getRangeAt(0);

        // Find the mes_text elements for both start and end of the selection
        let startMesText = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer.closest('.mes_text')
            : range.startContainer.parentElement.closest('.mes_text');

        let endMesText = range.endContainer.nodeType === Node.ELEMENT_NODE
            ? range.endContainer.closest('.mes_text')
            : range.endContainer.parentElement.closest('.mes_text');

        // Check if both start and end are within the same mes_text element
        if (startMesText && endMesText && startMesText === endMesText) {
            createRewriteMenu();
        }
    }

    lastSelection = selectedText.length > 0 ? selectedText : null;
}

async function getCustomInstructionsFromPopup() {
    const { callPopup } = getContext();
    try {
        const instructions = await callPopup('Enter custom rewrite instructions:', 'input');

        // Introduce a zero-delay setTimeout to yield to the event loop
        await new Promise(resolve => setTimeout(resolve, 0));

        return instructions;
    } catch (error) {
        console.error("[Rewrite Extension] Error during custom instruction popup:", error);
        return null;
    } finally {
    }
}

async function handleMenuItemClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const option = e.target.dataset.option;
    const selection = window.getSelection();

    // Ensure there's a selection and a range
    if (!selection || selection.rangeCount === 0) {
        removeRewriteMenu();
        return;
    }

    // Capture the range *before* any awaits or potential selection changes
    const initialRange = selection.getRangeAt(0).cloneRange();
    const selectedText = initialRange.toString().trim();

    if (selectedText) {
        const mesTextElement = findClosestMesText(selection.anchorNode);
        if (mesTextElement) {
            const messageDiv = findMessageDiv(mesTextElement);
            if (messageDiv) {
                const mesId = messageDiv.getAttribute('mesid');
                const swipeId = messageDiv.getAttribute('swipeid');

                if (option === 'delete') {
                    // Pass the initially captured range to handleDeleteSelection
                    await handleDeleteSelection(mesId, swipeId, initialRange);
                } else if (option === 'custom') {
                    const customInstructions = await getCustomInstructionsFromPopup();
                    if (customInstructions !== null && customInstructions.trim() !== '') { // Proceed only if user entered text and didn't cancel
                        // Get selectionInfo *after* await and *before* handleRewrite
                        // Pass the initially captured range
                        const selectionInfo = getSelectedTextInfo(mesId, mesTextElement, initialRange);
                        if (!selectionInfo) {
                             console.error("[Rewrite Extension] Failed to get selectionInfo for Custom rewrite!");
                             return; // Prevent calling with undefined
                        }
                        await handleRewrite(mesId, swipeId, option, customInstructions, selectionInfo); // Use the locally scoped selectionInfo
                    } else {
                        // User cancelled or entered empty instructions
                    }
                } else {
                    // For other rewrite options, get selectionInfo right before the call
                    // Pass the initially captured range
                    const selectionInfo = getSelectedTextInfo(mesId, mesTextElement, initialRange); // Get selectionInfo here
                    if (!selectionInfo) {
                         console.error(`[Rewrite Extension] Failed to get selectionInfo for ${option} rewrite!`);
                         return; // Prevent calling with undefined
                    }
                    await handleRewrite(mesId, swipeId, option, null, selectionInfo); // Use the locally scoped selectionInfo
                }
            }
        }
    }

    removeRewriteMenu();
}

// Modify signature to accept the captured range
async function handleDeleteSelection(mesId, swipeId, range) {
    const mesDiv = document.querySelector(`[mesid="${mesId}"] .mes_text`);
    // Use the passed-in range to get selection info
    const { fullMessage, selectedRawText, rawStartOffset, rawEndOffset } = getSelectedTextInfo(mesId, mesDiv, range);

    // Create the new message with the deleted section removed
    const newMessage = fullMessage.slice(0, rawStartOffset) + fullMessage.slice(rawEndOffset);

    // Save the change to the history (this also calls updateUndoButtons)
    saveLastChange(mesId, swipeId, fullMessage, newMessage);

    // Update the message in the chat context
    getContext().chat[mesId].mes = newMessage;
    if (swipeId !== undefined && getContext().chat[mesId].swipes) {
        getContext().chat[mesId].swipes[swipeId] = newMessage;
    }

    // Update the UI
    mesDiv.innerHTML = messageFormatting(newMessage, getContext().name2, getContext().chat[mesId].isSystem, getContext().chat[mesId].isUser, mesId);
    addCopyToCodeBlocks(mesDiv);

    // Save the chat
    await getContext().saveChat();
}

function hideMenuOnOutsideClick(e) {
    if (rewriteMenu && !rewriteMenu.contains(e.target)) {
        removeRewriteMenu();
    }
}

function createRewriteMenu() {
    removeRewriteMenu();

    rewriteMenu = document.createElement('ul');
    rewriteMenu.className = 'list-group ctx-menu';
    rewriteMenu.style.position = 'absolute';
    rewriteMenu.style.zIndex = '1000';
    rewriteMenu.style.position = 'fixed';

    const options = getOrderedContextMenuOptions();
    options.forEach(option => {
        if (option.show) {
            let li = document.createElement('li');
            li.className = 'list-group-item ctx-item';
            li.textContent = option.name;
            if (option.key === 'delete') {
                li.classList.add('rewrite-menu-item-delete');
                li.style.color = 'var(--danger, #e53935)';
            }
            li.addEventListener('mousedown', handleMenuItemClick);
            li.addEventListener('touchstart', handleMenuItemClick);
            li.dataset.option = option.key;
            rewriteMenu.appendChild(li);
        }
    });

    document.body.appendChild(rewriteMenu);
    positionMenu();
}

function positionMenu() {
    if (!rewriteMenu) return;

    let selection = window.getSelection();
    let range = selection.getRangeAt(0);
    let rect = range.getBoundingClientRect();

    // Calculate the menu's position
    let left = rect.left + window.pageXOffset;
    let top = rect.bottom + window.pageYOffset + 5;

    // Get the viewport dimensions
    let viewportWidth = window.innerWidth;
    let viewportHeight = window.innerHeight;

    // Get the menu's dimensions
    let menuWidth = rewriteMenu.offsetWidth;
    let menuHeight = rewriteMenu.offsetHeight;

    // Adjust the position if the menu overflows the viewport
    if (left + menuWidth > viewportWidth) {
        left = viewportWidth - menuWidth;
    }
    if (top + menuHeight > viewportHeight) {
        top = rect.top + window.pageYOffset - menuHeight - 5;
    }

    rewriteMenu.style.left = `${left}px`;
    rewriteMenu.style.top = `${top}px`;
}

function removeRewriteMenu() {
    if (rewriteMenu) {
        rewriteMenu.remove();
        rewriteMenu = null;
    }
}

function addUndoButton(mesId) {
    const messageDiv = document.querySelector(`[mesid="${mesId}"]`);
    if (messageDiv) {
        const mesButtons = messageDiv.querySelector('.mes_buttons');
        if (mesButtons) {
            const undoButton = document.createElement('div');
            undoButton.className = 'mes_button mes_undo_rewrite fa-solid fa-undo interactable';
            undoButton.title = 'Undo rewrite';
            undoButton.dataset.mesId = mesId;
            undoButton.addEventListener('click', handleUndo);

            if (mesButtons.children.length >= 1) {
                mesButtons.insertBefore(undoButton, mesButtons.children[1]);
            } else {
                mesButtons.appendChild(undoButton);
            }
        }
    }
}

function removeUndoButton(editedMesId) {
    // Remove all changes for this message from the changeHistory
    changeHistory = changeHistory.filter(change => change.mesId !== editedMesId);

    // Update undo buttons for other messages
    updateUndoButtons();
}

async function removeHighlight(mesDiv, mesId, swipeId) {
    const highlightSpan = mesDiv.querySelector('.animated-highlight');
    if (highlightSpan) {
        const textNode = document.createTextNode(highlightSpan.textContent);
        highlightSpan.parentNode.replaceChild(textNode, highlightSpan);
    }

    const context = getContext();
    const messageData = context.chat[mesId];

    if (messageData) {
        let messageContent;
        if (swipeId !== undefined && messageData.swipes && messageData.swipes[swipeId]) {
            messageContent = messageData.swipes[swipeId];
        } else {
            messageContent = messageData.mes;
        }

        // Format the message into HTML
        const formattedMessage = messageFormatting(
            messageContent,
            context.name2,
            messageData.isSystem,
            messageData.isUser,
            mesId
        );

        // Create a temporary div to hold the formatted message
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = formattedMessage;

        // Apply addCopyToCodeBlocks to the temporary div
        addCopyToCodeBlocks(tempDiv);

        // Find the mes_text element within the message div
        const mesTextElement = mesDiv.closest('.mes').querySelector('.mes_text');
        if (mesTextElement) {
            // Replace the content of mes_text with the new formatted content
            mesTextElement.innerHTML = tempDiv.innerHTML;
        }
    }
}

function findClosestMesText(element) {
    while (element && element.nodeType !== 1) {
        element = element.parentElement;
    }
    while (element) {
        if (element.classList && element.classList.contains('mes_text')) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

function findMessageDiv(element) {
    while (element) {
        if (element.hasAttribute('mesid') && element.hasAttribute('swipeid')) {
            return element;
        }
        element = element.parentElement;
    }
    return null;
}

function createTextMapping(rawText, formattedHtml) {
    const formattedText = stripHtml(formattedHtml);
    const mapping = [];
    let rawIndex = 0;
    let formattedIndex = 0;

    while (rawIndex < rawText.length && formattedIndex < formattedText.length) {
        if (rawText[rawIndex] === formattedText[formattedIndex]) {
            mapping.push([rawIndex, formattedIndex]);
            rawIndex++;
            formattedIndex++;
        } else if (rawText.substr(rawIndex, 3) === '...' && formattedText[formattedIndex] === '…') {
            // Handle ellipsis
            mapping.push([rawIndex, formattedIndex]);
            mapping.push([rawIndex + 1, formattedIndex]);
            mapping.push([rawIndex + 2, formattedIndex]);
            rawIndex += 3;
            formattedIndex++;
        } else if (formattedText[formattedIndex] === ' ' || formattedText[formattedIndex] === '\n') {
            // Skip extra whitespace in formatted text
            formattedIndex++;
        } else {
            // Skip characters in raw text that don't appear in formatted text
            rawIndex++;
        }
    }

    return {
        formattedToRaw: (formattedOffset) => {
            let low = 0;
            let high = mapping.length - 1;

            while (low <= high) {
                let mid = Math.floor((low + high) / 2);
                if (mapping[mid][1] === formattedOffset) {
                    return mapping[mid][0];
                } else if (mapping[mid][1] < formattedOffset) {
                    low = mid + 1;
                } else {
                    high = mid - 1;
                }
            }

            // If we didn't find an exact match, return the closest one
            if (low > 0) low--;
            return mapping[low][0] + (formattedOffset - mapping[low][1]);
        }
    };
}

function stripHtml(html) {
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function getTextOffset(parent, node) {
    const treeWalker = document.createTreeWalker(
        parent,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    let offset = 0;
    while (treeWalker.nextNode() !== node) {
        offset += treeWalker.currentNode.length;
    }

    return offset;
}

// Modify signature to accept the captured range
function getSelectedTextInfo(mesId, mesDiv, range) {
    // Removed: const selection = window.getSelection();
    // Removed: const range = selection.getRangeAt(0); - Use the passed-in range directly

    // Get the full message content
    const fullMessage = getContext().chat[mesId].mes;

    // Get the formatted message
    const formattedMessage = messageFormatting(fullMessage, undefined, getContext().chat[mesId].isSystem, getContext().chat[mesId].isUser, mesId);

    // Create a mapping between raw and formatted text
    const mapping = createTextMapping(fullMessage, formattedMessage);

    // Calculate the start and end offsets relative to the formatted text content
    const startOffset = getTextOffset(mesDiv, range.startContainer) + range.startOffset;
    const endOffset = getTextOffset(mesDiv, range.endContainer) + range.endOffset;

    // Map these offsets back to the raw message
    let rawStartOffset = mapping.formattedToRaw(startOffset);
    let rawEndOffset = mapping.formattedToRaw(endOffset);

    // Heuristic: Adjust offsets to include surrounding markdown if selection seems to abut it
    // Check for italics (*)
    if (rawStartOffset > 0 && rawEndOffset < fullMessage.length &&
        fullMessage[rawStartOffset - 1] === '*' && fullMessage[rawEndOffset] === '*') {
        // Avoid expanding if it looks like bold/bold-italics boundary
        const prevChar = rawStartOffset > 1 ? fullMessage[rawStartOffset - 2] : null;
        const nextChar = rawEndOffset + 1 < fullMessage.length ? fullMessage[rawEndOffset + 1] : null;
        if (prevChar !== '*' && nextChar !== '*') {
            rawStartOffset--;
            rawEndOffset++;
        }
    }
    // Check for bold (**) - ensure we don't double-adjust if italics check already expanded
    else if (rawStartOffset > 1 && rawEndOffset < fullMessage.length - 1 &&
             fullMessage.substring(rawStartOffset - 2, rawStartOffset) === '**' &&
             fullMessage.substring(rawEndOffset, rawEndOffset + 2) === '**') {
        // Avoid expanding if it looks like bold-italics boundary
        const prevChar = rawStartOffset > 2 ? fullMessage[rawStartOffset - 3] : null;
        const nextChar = rawEndOffset + 2 < fullMessage.length ? fullMessage[rawEndOffset + 2] : null;
        if (prevChar !== '*' && nextChar !== '*') {
            rawStartOffset -= 2;
            rawEndOffset += 2;
        }
    }
    // Note: This doesn't handle ***bold italics*** or nested cases perfectly, but covers common scenarios.

    // Get the selected raw text using potentially adjusted offsets
    const selectedRawText = fullMessage.substring(rawStartOffset, rawEndOffset);

    return {
        fullMessage,
        selectedRawText,
        rawStartOffset,
        rawEndOffset,
        range
    };
}

function saveLastChange(mesId, swipeId, originalContent, newContent) {
    changeHistory.push({
        mesId,
        swipeId,
        originalContent,
        newContent,
        timestamp: Date.now()
    });

    // Limit history to last n changes
    if (changeHistory.length > undo_steps) {
        changeHistory.shift();
    }

    updateUndoButtons();
}

function updateUndoButtons() {
    // Remove all existing undo buttons
    document.querySelectorAll('.mes_undo_rewrite').forEach(button => button.remove());

    // Add undo buttons for all messages with changes
    const changedMessageIds = [...new Set(changeHistory.map(change => change.mesId))];
    changedMessageIds.forEach(mesId => addUndoButton(mesId));
}

// Updated handleRewrite signature to accept selectionInfo
async function handleRewrite(mesId, swipeId, option, customInstructions = null, selectionInfo) {
    if (!selectionInfo) {
        console.error("[Rewrite Extension] handleRewrite called without selectionInfo!");
        return; // Cannot proceed without selection info
    }

    return openRewritePreviewInline(mesId, swipeId, option, customInstructions, selectionInfo);
}

async function generateRewriteCandidate(mesId, swipeId, option, customInstructions, selectionInfo, onProgress) {
    if (!selectionInfo) {
        return null;
    }

    if (main_api === 'openai') {
        const selectedModel = extension_settings[extensionName].selectedModel;
        if (selectedModel === 'chat_completion') {
            return handleChatCompletionRewrite(mesId, swipeId, option, customInstructions, selectionInfo, onProgress); // Pass selectionInfo
        } else {
            return handleSimplifiedChatCompletionRewrite(mesId, swipeId, option, customInstructions, selectionInfo, onProgress); // Pass selectionInfo
        }
    } else {
        return handleTextBasedRewrite(mesId, swipeId, option, customInstructions, selectionInfo, onProgress); // Pass selectionInfo
    }
}

function renderMessageInPlace(mesId) {
    const context = getContext();
    const messageDiv = document.querySelector(`[mesid="${mesId}"]`);
    const mesTextElement = messageDiv?.querySelector('.mes_text');
    const mesIndex = Number(mesId);
    if (!mesTextElement || Number.isNaN(mesIndex) || !context.chat[mesIndex]) {
        return;
    }

    mesTextElement.innerHTML = messageFormatting(
        context.chat[mesIndex].mes,
        context.name2,
        context.chat[mesIndex].isSystem,
        context.chat[mesIndex].isUser,
        mesIndex,
    );
    addCopyToCodeBlocks(mesTextElement);
}

function selectNodeContents(node) {
    const selection = window.getSelection();
    if (!selection || !node) return;

    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
}

async function openRewritePreviewInline(mesId, swipeId, option, customInstructions, selectionInfo) {
    const messageDiv = document.querySelector(`[mesid="${mesId}"]`);
    const mesTextElement = messageDiv?.querySelector('.mes_text');
    if (!mesTextElement) {
        return;
    }

    if (activeInlinePreview?.cleanup) {
        activeInlinePreview.cleanup();
    }

    const range = selectionInfo.range?.cloneRange();
    if (!range) {
        return;
    }

    const previewRoot = document.createElement('span');
    previewRoot.className = 'rewrite-inline-preview';
    previewRoot.innerHTML = `
        <span class="rewrite-inline-preview-toolbar">
            <button class="menu_button rewrite-inline-preview-button rewrite-inline-preview-apply" title="Apply preview">Apply</button>
            <button class="menu_button rewrite-inline-preview-button rewrite-inline-preview-retry" title="Generate again">Retry</button>
            <button class="menu_button rewrite-inline-preview-button rewrite-inline-preview-cancel" title="Cancel preview">Cancel</button>
            <button class="menu_button rewrite-inline-preview-button rewrite-inline-preview-prev" title="Previous generation">◀</button>
            <button class="menu_button rewrite-inline-preview-button rewrite-inline-preview-next" title="Next generation">▶</button>
            <span class="rewrite-inline-preview-index">Generation 0 / 0</span>
        </span>
        <span class="rewrite-inline-preview-content">Generating...</span>
    `;

    range.deleteContents();
    range.insertNode(previewRoot);

    const content = previewRoot.querySelector('.rewrite-inline-preview-content');
    const indexLabel = previewRoot.querySelector('.rewrite-inline-preview-index');
    const prevButton = previewRoot.querySelector('.rewrite-inline-preview-prev');
    const nextButton = previewRoot.querySelector('.rewrite-inline-preview-next');
    const applyButton = previewRoot.querySelector('.rewrite-inline-preview-apply');
    const retryButton = previewRoot.querySelector('.rewrite-inline-preview-retry');
    const cancelButton = previewRoot.querySelector('.rewrite-inline-preview-cancel');

    const generations = [];
    let generationIndex = -1;
    let isGenerating = false;

    const renderGeneration = () => {
        if (generationIndex < 0 || !generations[generationIndex]) {
            indexLabel.textContent = 'Generation 0 / 0';
            content.textContent = isGenerating ? 'Generating...' : 'No generations yet.';
            return;
        }
        content.textContent = generations[generationIndex];
        indexLabel.textContent = `Generation ${generationIndex + 1} / ${generations.length}`;
    };

    const onKeyDown = (event) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            prevButton.click();
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            nextButton.click();
        } else if (event.key === 'Escape') {
            cleanup();
        }
    };

    const cleanup = () => {
        if (isGenerating && abortController) {
            abortController.abort();
            getContext().activateSendButtons();
        }
        document.removeEventListener('keydown', onKeyDown);

        if (activeInlinePreview?.mesId === mesId) {
            activeInlinePreview = null;
        }

        renderMessageInPlace(mesId);
    };

    activeInlinePreview = { mesId, cleanup };

    const generate = async () => {
        if (isGenerating) return;
        isGenerating = true;
        content.textContent = 'Generating...';
        try {
            const candidate = await generateRewriteCandidate(mesId, swipeId, option, customInstructions, selectionInfo, (partialText) => {
                content.textContent = partialText || 'Generating...';
                selectNodeContents(content);
            });
            if (typeof candidate === 'string' && candidate.length) {
                generations.push(candidate);
                generationIndex = generations.length - 1;
            }
        } catch (error) {
            console.error('[Rewrite Extension] Failed to generate rewrite candidate:', error);
        } finally {
            isGenerating = false;
            renderGeneration();
        }
    };

    prevButton.addEventListener('click', () => {
        if (!generations.length) return;
        generationIndex = (generationIndex - 1 + generations.length) % generations.length;
        renderGeneration();
        selectNodeContents(content);
    });

    nextButton.addEventListener('click', () => {
        if (!generations.length) return;
        generationIndex = (generationIndex + 1) % generations.length;
        renderGeneration();
        selectNodeContents(content);
    });

    retryButton.addEventListener('click', generate);

    applyButton.addEventListener('click', async () => {
        if (generationIndex < 0 || !generations[generationIndex]) return;
        const { fullMessage, rawStartOffset, rawEndOffset } = selectionInfo;
        await saveRewrittenText(mesId, swipeId, fullMessage, rawStartOffset, rawEndOffset, generations[generationIndex]);
        activeInlinePreview = null;
        cleanup();
    });

    cancelButton.addEventListener('click', cleanup);
    document.addEventListener('keydown', onKeyDown);
    selectNodeContents(content);

    await generate();
}

// Updated signature to accept selectionInfo
async function handleChatCompletionRewrite(mesId, swipeId, option, customInstructions, selectionInfo, onProgress = null) {
    // Use pre-captured selection info
    const { fullMessage, selectedRawText } = selectionInfo;

    // Get the selected preset based on the option
    let selectedPreset;
    switch (option) {
        case 'rewrite':
            selectedPreset = extension_settings[extensionName].rewritePreset;
            break;
        case 'shorten':
            selectedPreset = extension_settings[extensionName].shortenPreset;
            break;
        case 'expand':
            selectedPreset = extension_settings[extensionName].expandPreset;
            break;
        case 'custom':
            selectedPreset = extension_settings[extensionName].customPreset;
            break;
        case 'extra1':
        case 'extra2':
        case 'extra3':
        case 'extra4':
        case 'extra5':
        case 'extra6':
        case 'extra7':
        case 'extra8':
        case 'extra9':
        case 'extra10':
            selectedPreset = extension_settings[extensionName].customPreset;
            break;
        default:
            console.error("Unknown rewrite option:", option);
            return; // Exit if the option is not recognized
    }

    // Fetch the settings
    const result = await fetch('/api/settings/get', {
        method: 'POST',
        headers: getContext().getRequestHeaders(),
        body: JSON.stringify({}),
    });

    if (!result.ok) {
        console.error('Failed to fetch settings');
        return;
    }

    const data = await result.json();
    const presetIndex = data.openai_setting_names.indexOf(selectedPreset);
    if (presetIndex === -1) {
        console.error('Selected preset not found');
        return;
    }

    // Save the current settings
    const prev_oai_settings = Object.assign({}, oai_settings);

    // Parse the selected preset settings
    let selectedPresetSettings;
    try {
        selectedPresetSettings = JSON.parse(data.openai_settings[presetIndex]);
    } catch (error) {
        console.error('Error parsing preset settings:', error);
        return;
    }

    // Extension streaming overrides preset streaming
    selectedPresetSettings.stream_openai = extension_settings[extensionName].useStreaming;

    if (extension_settings[extensionName].overrideMaxTokens) {
        selectedPresetSettings.openai_max_tokens = calculateTargetTokenCount(selectedRawText, option);
    }

    // Override oai_settings with the selected preset
    Object.assign(oai_settings, selectedPresetSettings);

    // Always generate the base prompt using the selected preset
    const promptReadyPromise = new Promise(resolve => {
        eventSource.once(event_types.CHAT_COMPLETION_PROMPT_READY, resolve);
    });
    getContext().generate('normal', {}, true); // Trigger prompt generation
    const promptData = await promptReadyPromise; // Wait for the generated prompt
    let chatToSend = promptData.chat; // Start with the generated chat array

    // Inject custom instructions if applicable
    if (option === 'custom' && customInstructions) {
        // Find the last user message to append to
        let targetMessageIndex = -1;
        for (let i = chatToSend.length - 1; i >= 0; i--) {
            if (chatToSend[i].role === 'user') {
                targetMessageIndex = i;
                break;
            }
        }

        if (targetMessageIndex !== -1) {
            const targetMessage = chatToSend[targetMessageIndex];
            const instructionText = `\n\nAdditional Instructions:\n${customInstructions}`;

            if (Array.isArray(targetMessage.content)) {
                // Find the last text part or add a new one
                let lastTextPartIndex = -1;
                for (let j = targetMessage.content.length - 1; j >= 0; j--) {
                    if (targetMessage.content[j].type === 'text') {
                        lastTextPartIndex = j;
                        break;
                    }
                }
                if (lastTextPartIndex !== -1) {
                    targetMessage.content[lastTextPartIndex].text += instructionText;
                } else {
                    // Should not happen with standard prompts, but handle just in case
                    targetMessage.content.push({ type: 'text', text: instructionText });
                }
            } else if (typeof targetMessage.content === 'string') {
                targetMessage.content += instructionText;
            }
        } else {
            console.warn('[Rewrite Extension] Could not find a user message in the generated prompt to inject custom instructions into.');
            // Optionally, could append a new user message, but might break formatting
            // chatToSend.push({ role: "user", content: `Additional Instructions:\n${customInstructions}` });
        }
    }

    // Substitute standard macros AFTER potential custom instruction injection
    const wordCount = extractAllWords(selectedRawText).length;
    chatToSend = chatToSend.map(message => {
        if (Array.isArray(message.content)) {
            message.content = message.content.map(item => {
                if (item.type === 'text') {
                    item.text = item.text.replace(/{{rewrite}}/gi, selectedRawText);
                    item.text = item.text.replace(/{{targetmessage}}/gi, fullMessage);
                    item.text = item.text.replace(/{{rewritecount}}/gi, wordCount);
                }
                return item;
            });
        } else if (typeof message.content === 'string') {
            message.content = message.content.replace(/{{rewrite}}/gi, selectedRawText);
            message.content = message.content.replace(/{{targetmessage}}/gi, fullMessage);
            message.content = message.content.replace(/{{rewritecount}}/gi, wordCount);
        }
        return message;
    });

    // Create a new AbortController
    abortController = new AbortController();

    // Store the necessary data in the signal
    abortController.signal.prev_oai_settings = prev_oai_settings;

    // Show the stop button
    getContext().deactivateSendButtons();

    let res;
    try {

        // Send the request with the prepared chat
        res = await sendOpenAIRequest('normal', chatToSend, abortController.signal);
    } catch (error) {
        console.error('[Rewrite Extension] Error during sendOpenAIRequest:', error);
        toastr.error("Rewrite failed. Check browser console (F12) for details.", "Rewrite Error");
        // Ensure cleanup happens even on error
    } finally {
        window.getSelection().removeAllRanges();
        // Restore the original settings (moved to finally)
        Object.assign(oai_settings, prev_oai_settings);
        getContext().activateSendButtons();
    }

    // If the request failed, res will be undefined, stop further processing
    if (res === undefined) {
        return null;
    }

    let newText = '';
    if (typeof res === 'function') {
        for await (const chunk of res()) {
            newText = chunk.text;
            if (typeof onProgress === 'function') {
                onProgress(newText);
            }
        }
    } else {
        newText = res?.choices?.[0]?.message?.content ?? res?.choices?.[0]?.text ?? res?.text ?? '';
        if (typeof onProgress === 'function') {
            onProgress(newText);
        }
    }

    return newText;
}



function getPromptTemplateForOption(option) {
    switch (option) {
        case 'rewrite': return extension_settings[extensionName].textRewritePrompt;
        case 'shorten': return extension_settings[extensionName].textShortenPrompt;
        case 'expand': return extension_settings[extensionName].textExpandPrompt;
        case 'custom': return extension_settings[extensionName].textCustomPrompt;
        case 'extra1': return extension_settings[extensionName].textExtra1Prompt;
        case 'extra2': return extension_settings[extensionName].textExtra2Prompt;
        case 'extra3': return extension_settings[extensionName].textExtra3Prompt;
        case 'extra4': return extension_settings[extensionName].textExtra4Prompt;
        case 'extra5': return extension_settings[extensionName].textExtra5Prompt;
        case 'extra6': return extension_settings[extensionName].textExtra6Prompt;
        case 'extra7': return extension_settings[extensionName].textExtra7Prompt;
        case 'extra8': return extension_settings[extensionName].textExtra8Prompt;
        case 'extra9': return extension_settings[extensionName].textExtra9Prompt;
        case 'extra10': return extension_settings[extensionName].textExtra10Prompt;
        default: return null;
    }
}

// Updated signature to accept selectionInfo
async function handleSimplifiedChatCompletionRewrite(mesId, swipeId, option, customInstructions, selectionInfo, onProgress = null) {
    // Use pre-captured selection info
    const { fullMessage, selectedRawText } = selectionInfo;
    // Get the text completion prompt based on the option
    const promptTemplate = getPromptTemplateForOption(option);
    if (!promptTemplate) {
        console.error("Unknown rewrite option:", option);
        return;
    }

    // Get amount of words
    const wordCount = extractAllWords(selectedRawText).length;

    // Replace macros in the prompt template
    let prompt = getContext().substituteParams(promptTemplate);

    prompt = prompt
        .replace(/{{rewrite}}/gi, selectedRawText)
        .replace(/{{targetmessage}}/gi, fullMessage)
        .replace(/{{rewritecount}}/gi, wordCount);

    // Inject custom instructions if applicable
    if (option === 'custom') {
        if (prompt.includes('{{custom_instructions}}')) {
            prompt = prompt.replace(/{{custom_instructions}}/gi, customInstructions);
        } else {
            // Append if macro is missing (basic fallback)
            prompt += `\n\nInstructions: ${customInstructions}`;
        }
    }

    // Create a simplified chat format
    const simplifiedChat = [
        {
            role: "system",
            content: prompt
        }
    ];

    // Create a new AbortController
    abortController = new AbortController();


    // Show the stop button
    getContext().deactivateSendButtons();

    const res = await sendOpenAIRequest('normal', simplifiedChat, abortController.signal);
    window.getSelection().removeAllRanges();

    let newText = '';

    if (typeof res === 'function') {
        for await (const chunk of res()) {
            newText = chunk.text;
            if (typeof onProgress === 'function') {
                onProgress(newText);
            }
        }
    } else {
        newText = res?.choices?.[0]?.message?.content ?? '';
        if (typeof onProgress === 'function') {
            onProgress(newText);
        }
    }

    getContext().activateSendButtons();
    return newText;
}


// Updated signature to accept selectionInfo
async function handleTextBasedRewrite(mesId, swipeId, option, customInstructions, selectionInfo, onProgress = null) {
    // Use pre-captured selection info
    const { fullMessage, selectedRawText } = selectionInfo;
    // Get the selected model and option-specific prompt
    const selectedModel = extension_settings[extensionName].selectedModel;
    const promptTemplate = getPromptTemplateForOption(option);
    if (!promptTemplate) {
        console.error('Unknown rewrite option:', option);
        return;
    }
    // Get amount of words
    const wordCount = extractAllWords(selectedRawText).length;

    // Replace macros in the prompt template
    let prompt = getContext().substituteParams(promptTemplate);

    prompt = prompt
        .replace(/{{rewrite}}/gi, selectedRawText)
        .replace(/{{targetmessage}}/gi, fullMessage)
        .replace(/{{rewritecount}}/gi, wordCount);

    // Inject custom instructions if applicable
    if (option === 'custom') {
        if (prompt.includes('{{custom_instructions}}')) {
            prompt = prompt.replace(/{{custom_instructions}}/gi, customInstructions);
        } else {
            // Append if macro is missing (basic fallback)
            prompt += `\n\nInstructions: ${customInstructions}`;
        }
    }

    let generateData;
    const amount_gen = calculateTargetTokenCount(selectedRawText);

    // Prepare generation data based on the selected model
    switch (main_api) {
        case 'novel':
            const novelSettings = novelai_settings[novelai_setting_names[nai_settings.preset_settings_novel]];
            generateData = getNovelGenerationData(prompt, novelSettings, amount_gen, false, false, null, 'quiet');
            break;
        case 'textgenerationwebui':
            generateData = getTextGenGenerationData(prompt, amount_gen, false, false, null, 'quiet');
            break;
        case 'koboldhorde':
            if (option === 'custom') {
                // For Custom Horde, use the manually constructed prompt directly
                // We need a basic structure for generateHorde, mimicking what getContext().generate would provide
                generateData = {
                    prompt: prompt, // Use the manually constructed prompt
                    max_length: Math.max(amount_gen, MIN_LENGTH),
                    // Include other necessary default parameters if generateHorde requires them
                    // Based on generateHorde usage, 'quiet' and potentially others might be needed.
                    quiet: true, // Often used in background generation
                };
            } else {
                // Existing logic for non-custom Horde rewrites
                const promptReadyPromise = new Promise(resolve => {
                    eventSource.once(event_types.GENERATE_AFTER_DATA, resolve);
                });
                getContext().generate('normal', {}, true); // Trigger standard prompt generation
                generateData = await promptReadyPromise; // Wait for the generated data
                generateData.max_length = Math.max(amount_gen, MIN_LENGTH);
            }
            break;
        // Add more cases for other text-based models as needed
        default:
            toastr.error('Unsupported model:', main_api);
            return;
    }

    // Create a new AbortController
    abortController = new AbortController();


    // Show the stop button
    getContext().deactivateSendButtons();
    let res;
    if (extension_settings[extensionName].useStreaming) {
        switch (main_api) {
            case 'textgenerationwebui':
                res = await generateTextGenWithStreaming(generateData, abortController.signal);
                break;
            case 'novel':
                res = await generateNovelWithStreaming(generateData, abortController.signal);
                break;
            case 'koboldhorde':
                toastr.warning('Rewrite streaming not supported for Kobold. Turn off in rewrite settings.');
            default:
                throw new Error('Streaming is enabled, but the current API does not support streaming.');
        }
    } else {
        if (main_api === 'koboldhorde') {
            res = await generateHorde(prompt, generateData, abortController.signal, true);
        } else {
            const response = await generateRaw(prompt, null, false, false, null, generateData.max_length);
            res = {text: response};
            // Shamelessly copied from script.js
            /*function getGenerateUrl(api) {
                switch (api) {
                    case 'textgenerationwebui':
                        return '/api/backends/text-completions/generate';
                    case 'novel':
                        return '/api/novelai/generate';
                    default:
                        throw new Error(`Unknown API: ${api}`);
                }
            }

            const response = await fetch(getGenerateUrl(main_api), {
                method: 'POST',
                headers: getRequestHeaders(),
                cache: 'no-cache',
                body: JSON.stringify(generateData),
                signal: abortController.signal,
            });

            if (!response.ok) {
                const error = await response.json();
                throw error;
            }

            res = await response.json();*/
        }
    }

    window.getSelection().removeAllRanges();

    let newText = '';

    if (typeof res === 'function') {
        for await (const chunk of res()) {
            newText = chunk.text;
            if (typeof onProgress === 'function') {
                onProgress(newText);
            }
        }
    } else {
        newText = res?.choices?.[0]?.message?.content ?? res?.choices?.[0]?.text ?? res?.text ?? '';
        if (main_api === 'novel') newText = res.output;
        if (typeof onProgress === 'function') {
            onProgress(newText);
        }
    }

    getContext().activateSendButtons();
    return newText;
}

function calculateTargetTokenCount(selectedText) {
    const baseTokenCount = getTokenCount(selectedText);
    const fixedMultiplier = 5;
    const result = baseTokenCount * fixedMultiplier;

    return Math.max(1, Math.round(result));
}

async function handleUndo(event) {
    const mesId = event.target.dataset.mesId;
    const change = changeHistory.findLast(change => change.mesId === mesId);

    if (change) {
        const context = getContext();
        const messageDiv = document.querySelector(`[mesid="${mesId}"]`);

        if (!messageDiv || !context.chat[mesId]) {
            console.error('Message not found for undo operation');
            return;
        }

        // Update the chat context
        context.chat[mesId].mes = change.originalContent;

        // Only update swipes if they exist
        if (change.swipeId !== undefined && context.chat[mesId].swipes) {
            context.chat[mesId].swipes[change.swipeId] = change.originalContent;
        }

        // Update the UI
        const mesTextElement = messageDiv.querySelector('.mes_text');
        if (mesTextElement) {
            mesTextElement.innerHTML = messageFormatting(
                change.originalContent,
                context.name2,
                context.chat[mesId].isSystem,
                context.chat[mesId].isUser,
                mesId
            );
            addCopyToCodeBlocks(mesTextElement);
        }

        // Save the chat
        await context.saveChat();

        // Remove this change from history
        changeHistory = changeHistory.filter(c => c !== change);

        // Update undo buttons
        updateUndoButtons();
    }
}

async function saveRewrittenText(mesId, swipeId, fullMessage, startOffset, endOffset, newText) {
    const context = getContext();
    const mesIndex = Number(mesId);
    const swipeIndex = swipeId !== undefined && swipeId !== null && swipeId !== ''
        ? Number(swipeId)
        : undefined;

    // Get the prefix and suffix to remove from the settings
    const removePrefix = extension_settings[extensionName].removePrefix || '';
    const removeSuffix = extension_settings[extensionName].removeSuffix || '';

    // Remove prefix if present
    if (removePrefix && newText.startsWith(removePrefix)) {
        newText = newText.slice(removePrefix.length);
    }

    // Remove suffix if present
    if (removeSuffix && newText.endsWith(removeSuffix)) {
        newText = newText.slice(0, -removeSuffix.length);
    }

    // Apply AI Output regex scripts if setting is enabled
    let processedText = newText; // Default to original newText
    if (extension_settings[extensionName].applyRegexOnRewrite) {
        processedText = getRegexedString(newText, regex_placement.AI_OUTPUT);
    }

    // Create the new message with the rewritten and potentially processed section
    const newMessage =
        fullMessage.substring(0, startOffset) +
        processedText + // Use the processed text here
        fullMessage.substring(endOffset);

    // Save the change to the history
    saveLastChange(mesId, swipeId, fullMessage, newMessage);

    // Update the main message
    context.chat[mesIndex].mes = newMessage;

    // Update the swipe if it exists
    if (
        swipeIndex !== undefined
        && Number.isInteger(swipeIndex)
        && context.chat[mesIndex].swipes
        && swipeIndex >= 0
        && swipeIndex < context.chat[mesIndex].swipes.length
    ) {
        context.chat[mesIndex].swipes[swipeIndex] = newMessage;
    }

    // Update the currently visible message immediately
    const messageDiv = document.querySelector(`[mesid="${mesId}"]`);
    const mesTextElement = messageDiv?.querySelector('.mes_text');
    if (mesTextElement) {
        mesTextElement.innerHTML = messageFormatting(
            newMessage,
            context.name2,
            context.chat[mesIndex].isSystem,
            context.chat[mesIndex].isUser,
            mesIndex,
        );
        addCopyToCodeBlocks(mesTextElement);
    }

    // Save and reload the chat
    await context.saveChat();
}
