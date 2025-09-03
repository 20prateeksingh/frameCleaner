/// <reference types="@figma/plugin-typings" />

// Frame Cleaner Plugin - Complete TypeScript with Enhanced Critical Safety Checks and Select-and-Zoom Feature
// Optimizes auto-layout structures by merging unnecessary nested frames and selectively dissolving compatible siblings
// Features: Layout sizing inheritance, selective sibling dissolution with full→partial hierarchy, cross-direction padding validation
// V1 ENHANCED: Critical safety checks for transforms, gradients, images, prototype interactions, wrap mode, baseline alignment

// Type definitions
interface CleaningResults {
  framesAnalyzed: number;
  framesMerged: number;
  siblingGroupsOptimized: number;
  siblingsRemoved: number;
  paddingOptimized: number;
  issues: Array<{
    node: string;
    issue: string;
  }>;
}

interface AnalysisResults {
  totalFrames: number;
  mergeableFrames: number;
  optimizableSiblingGroups: number;
  paddingOptimizations: number;
  removableFrames: number;
  removableFrameNames: string[];
  removableNodeIds: string[];
  frameName: string;
  frameId: string;
  issues: Array<{
    node: string;
    issue: string;
  }>;
}

interface CombinedPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface CrossDirectionPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface UIMessage {
  type: string;
  nodeId?: string;
  settings?: {
    removeSingleChild?: boolean;
  };
}

// Type guards
function isFrameNode(node: SceneNode): node is FrameNode {
  return node.type === 'FRAME';
}

function isGroupNode(node: SceneNode): node is GroupNode {
  return node.type === 'GROUP';
}

function isFrameOrGroup(node: SceneNode): node is FrameNode | GroupNode {
  return isFrameNode(node) || isGroupNode(node);
}

function hasAutoLayout(node: FrameNode | GroupNode): node is FrameNode {
  return isFrameNode(node) && node.layoutMode !== 'NONE';
}

function hasChildren(node: SceneNode): node is FrameNode | GroupNode | ComponentNode | InstanceNode {
  return 'children' in node && Array.isArray(node.children);
}

// Symbol safety helpers
function isArrayValue<T>(value: readonly T[] | symbol): value is readonly T[] {
  return Array.isArray(value);
}

function isNumberValue(value: number | symbol | unknown): value is number {
  return typeof value === 'number';
}

function isUnknownNumberValue(value: unknown): value is number {
  return typeof value === 'number';
}

function isStringValue(value: string | symbol): value is string {
  return typeof value === 'string';
}

// PHASE 1 CRITICAL SAFETY CHECKS

function hasTransformOrRotation(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node)) return false;
    
    if ('rotation' in node && isNumberValue(node.rotation) && Math.abs(node.rotation) > 0.001) {
      return true;
    }
    
    if ('skewX' in node && isUnknownNumberValue((node as any).skewX) && Math.abs((node as any).skewX) > 0.001) {
      return true;
    }
    
    if ('skewY' in node && isUnknownNumberValue((node as any).skewY) && Math.abs((node as any).skewY) > 0.001) {
      return true;
    }
    
    if ('relativeTransform' in node && Array.isArray(node.relativeTransform)) {
      const transform = node.relativeTransform;
      const isIdentity = transform.length === 2 &&
                        Math.abs(transform[0][0] - 1) < 0.001 &&
                        Math.abs(transform[0][1]) < 0.001 &&
                        Math.abs(transform[1][0]) < 0.001 &&
                        Math.abs(transform[1][1] - 1) < 0.001;
      
      if (!isIdentity) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

function hasComplexFills(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node) || !('fills' in node)) return false;
    
    const fills = node.fills;
    if (!isArrayValue(fills) || fills.length === 0) return false;
    
    for (const fill of fills) {
      if (!fill.visible) continue;
      
      if (fill.type === 'GRADIENT_LINEAR' || 
          fill.type === 'GRADIENT_RADIAL' || 
          fill.type === 'GRADIENT_ANGULAR' || 
          fill.type === 'GRADIENT_DIAMOND') {
        return true;
      }
      
      if (fill.type === 'IMAGE' || fill.type === 'VIDEO') {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

function hasComplexStrokes(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node) || !('strokes' in node)) return false;
    
    const strokes = node.strokes;
    if (!isArrayValue(strokes) || strokes.length === 0) return false;
    
    for (const stroke of strokes) {
      if (!stroke.visible) continue;
      
      if (stroke.type !== 'SOLID') {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

function hasPrototypeInteractions(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node)) return false;
    
    if ('reactions' in node && isArrayValue(node.reactions) && node.reactions.length > 0) {
      return true;
    }
    
    if ('flowStartingPoints' in node && Array.isArray(node.flowStartingPoints) && node.flowStartingPoints.length > 0) {
      return true;
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

function hasAdvancedLayoutModes(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node) || !isFrameNode(node)) return false;
    
    if ('layoutWrap' in node && node.layoutWrap === 'WRAP') {
      return true;
    }
    
    if (hasAutoLayout(node) && node.counterAxisAlignItems === 'BASELINE') {
      return true;
    }
    
    if (node.layoutMode === 'GRID') {
      return true;
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

function getChildSpacingInfo(childFrame: FrameNode): {
  hasAutoGap: boolean;
  itemSpacing: number;
  impliedGapPixels: number;
  primaryAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
} {
  if (!hasAutoLayout(childFrame)) {
    return {
      hasAutoGap: false,
      itemSpacing: 0,
      impliedGapPixels: 0,
      primaryAxisAlignItems: 'MIN'
    };
  }

  const itemSpacing = childFrame.itemSpacing;
  const primaryAlign = childFrame.primaryAxisAlignItems;
  
  const hasAutoGap = primaryAlign === 'SPACE_BETWEEN';
  
  if (hasAutoGap) {
    const impliedGapPixels = typeof itemSpacing === 'number' ? itemSpacing : 0;
    
    return {
      hasAutoGap: true,
      itemSpacing: 0,
      impliedGapPixels: impliedGapPixels,
      primaryAxisAlignItems: 'SPACE_BETWEEN'
    };
  }
  
  if (typeof itemSpacing === 'number') {
    return {
      hasAutoGap: false,
      itemSpacing: itemSpacing,
      impliedGapPixels: itemSpacing,
      primaryAxisAlignItems: primaryAlign
    };
  }
  
  if (typeof itemSpacing === 'symbol') {
    return {
      hasAutoGap: false,
      itemSpacing: 0,
      impliedGapPixels: 0,
      primaryAxisAlignItems: primaryAlign
    };
  }
  
  return {
    hasAutoGap: false,
    itemSpacing: 0,
    impliedGapPixels: 0,
    primaryAxisAlignItems: primaryAlign
  };
}

function calculateImpliedGap(container: FrameNode): number {
  if (!hasAutoLayout(container) || container.primaryAxisAlignItems !== 'SPACE_BETWEEN') {
    return 0;
  }
  
  const currentGap = container.itemSpacing;
  if (typeof currentGap === 'number') {
    return currentGap;
  }
  
  const children = getLayoutChildren(container);
  if (children.length < 2) return 0;
  
  try {
    const containerSize = container.layoutMode === 'HORIZONTAL' ? container.width : container.height;
    const childrenTotalSize = children.reduce((sum, child) => {
      if (!nodeExists(child)) return sum;
      const childSize = container.layoutMode === 'HORIZONTAL' ? child.width : child.height;
      return sum + childSize;
    }, 0);
    
    const paddingStart = container.layoutMode === 'HORIZONTAL' ? container.paddingLeft : container.paddingTop;
    const paddingEnd = container.layoutMode === 'HORIZONTAL' ? container.paddingRight : container.paddingBottom;
    
    const availableSpace = containerSize - childrenTotalSize - paddingStart - paddingEnd;
    const numberOfGaps = children.length - 1;
    
    return numberOfGaps > 0 ? availableSpace / numberOfGaps : 0;
  } catch (error) {
    return 0;
  }
}

// Safe node access helpers
function nodeExists(node: BaseNode): boolean {
  try {
    const id = node.id;
    return !node.removed;
  } catch (error) {
    return false;
  }
}

function safeGetNodeName(node: BaseNode): string {
  try {
    if (!nodeExists(node)) return '[REMOVED NODE]';
    return node.name || '[UNNAMED]';
  } catch (error) {
    return '[INACCESSIBLE NODE]';
  }
}

function safeGetNodeType(node: BaseNode): string {
  try {
    if (!nodeExists(node)) return 'REMOVED';
    return node.type;
  } catch (error) {
    return 'INACCESSIBLE';
  }
}

function safeGetDimensions(node: SceneNode): { width: number; height: number } {
  try {
    if (!nodeExists(node)) return { width: 0, height: 0 };
    return { width: node.width, height: node.height };
  } catch (error) {
    return { width: 0, height: 0 };
  }
}

// Layout sizing inheritance logic
function calculateInheritedSizing(
  childFrameSizing: string,
  grandchildOriginalSizing: string
): string {
  switch (childFrameSizing) {
    case 'FIXED':
      switch (grandchildOriginalSizing) {
        case 'FIXED': return 'FIXED';
        case 'FILL':  return 'FIXED';
        case 'HUG':   return 'HUG';
      }
      break;
      
    case 'FILL':
      switch (grandchildOriginalSizing) {
        case 'FIXED': return 'FIXED';
        case 'FILL':  return 'FILL';
        case 'HUG':   return 'HUG';
      }
      break;
      
    case 'HUG':
      switch (grandchildOriginalSizing) {
        case 'FIXED': return 'FIXED';
        case 'FILL':  return 'FIXED';
        case 'HUG':   return 'HUG';
      }
      break;
  }
  
  return grandchildOriginalSizing;
}

function applyLayoutSizingInheritance(
  parentFrame: FrameNode,
  childFrame: FrameNode,
  grandchildren: SceneNode[]
): void {
  if (!nodeExists(parentFrame) || !nodeExists(childFrame)) return;
  
  let childHorizontalSizing: string;
  let childVerticalSizing: string;
  
  try {
    childHorizontalSizing = childFrame.layoutSizingHorizontal;
    childVerticalSizing = childFrame.layoutSizingVertical;
  } catch (error) {
    return;
  }
  
  const existingGrandchildren = grandchildren.filter(grandchild => nodeExists(grandchild));
  
  existingGrandchildren.forEach((grandchild) => {
    if (!nodeExists(grandchild) || !isFrameNode(grandchild)) return;
    
    try {
      const originalHorizontal = grandchild.layoutSizingHorizontal;
      const originalVertical = grandchild.layoutSizingVertical;
      
      const newHorizontal = calculateInheritedSizing(childHorizontalSizing, originalHorizontal);
      const newVertical = calculateInheritedSizing(childVerticalSizing, originalVertical);
      
      if (newHorizontal !== originalHorizontal && nodeExists(grandchild)) {
        grandchild.layoutSizingHorizontal = newHorizontal as 'FIXED' | 'FILL' | 'HUG';
      }
      
      if (newVertical !== originalVertical && nodeExists(grandchild)) {
        grandchild.layoutSizingVertical = newVertical as 'FIXED' | 'FILL' | 'HUG';
      }
    } catch (error) {
      // Silent fail
    }
  });
}

function determineAlignmentInheritance(
  parentFrame: FrameNode,
  childFrame: FrameNode | GroupNode,
  childSpacingInfo?: { hasAutoGap: boolean; primaryAxisAlignItems: string }
): {
  inheritPrimaryAxis: boolean;
  inheritCounterAxis: boolean;
  forceSpaceBetween: boolean;
} {
  if (!nodeExists(parentFrame) || !nodeExists(childFrame)) {
    return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
  }
  
  if (!isFrameNode(childFrame)) {
    return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
  }
  
  let parentLayoutMode: string;
  let childLayoutMode: string;
  
  try {
    parentLayoutMode = parentFrame.layoutMode;
    childLayoutMode = childFrame.layoutMode;
  } catch (error) {
    return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
  }
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const isSingleChildMerge = layoutChildren.length === 1;
  
  if (isSingleChildMerge) {
    let parentPrimarySizing: string;
    let parentCounterSizing: string;
    let childPrimarySizing: string;
    let childCounterSizing: string;
    
    try {
      if (parentLayoutMode === 'VERTICAL') {
        parentPrimarySizing = parentFrame.primaryAxisSizingMode;
        parentCounterSizing = parentFrame.counterAxisSizingMode;
        childPrimarySizing = childFrame.primaryAxisSizingMode;
        childCounterSizing = childFrame.counterAxisSizingMode;
      } else if (parentLayoutMode === 'HORIZONTAL') {
        parentPrimarySizing = parentFrame.primaryAxisSizingMode;
        parentCounterSizing = parentFrame.counterAxisSizingMode;
        childPrimarySizing = childFrame.primaryAxisSizingMode;
        childCounterSizing = childFrame.counterAxisSizingMode;
      } else {
        return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
      }
    } catch (error) {
      return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
    }
    
    const inheritPrimaryAxis = shouldInheritAlignment(parentPrimarySizing, childPrimarySizing, 'primary');
    const inheritCounterAxis = shouldInheritAlignment(parentCounterSizing, childCounterSizing, 'counter');
    
    const forceSpaceBetween = childSpacingInfo?.hasAutoGap || false;
    
    return { 
      inheritPrimaryAxis, 
      inheritCounterAxis, 
      forceSpaceBetween 
    };
  }
  
  if (childSpacingInfo?.hasAutoGap) {
    return { 
      inheritPrimaryAxis: true, 
      inheritCounterAxis: false,
      forceSpaceBetween: true 
    };
  }
  
  if (parentLayoutMode !== childLayoutMode) {
    return { 
      inheritPrimaryAxis: true, 
      inheritCounterAxis: true, 
      forceSpaceBetween: false 
    };
  }
  
  let primaryAxisSizing: string;
  let counterAxisSizing: string;
  
  try {
    if (parentLayoutMode === 'VERTICAL') {
      primaryAxisSizing = childFrame.layoutSizingVertical;
      counterAxisSizing = childFrame.layoutSizingHorizontal;
    } else if (parentLayoutMode === 'HORIZONTAL') {
      primaryAxisSizing = childFrame.layoutSizingHorizontal;
      counterAxisSizing = childFrame.layoutSizingVertical;
    } else {
      return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
    }
  } catch (error) {
    return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
  }
  
  const inheritPrimaryAxis = primaryAxisSizing === 'FILL';
  const inheritCounterAxis = counterAxisSizing === 'FILL';
  
  return { inheritPrimaryAxis, inheritCounterAxis, forceSpaceBetween: false };
}

function shouldInheritAlignment(parentSizing: string, childSizing: string, axis: string): boolean {
  if (parentSizing === 'FILL') {
    if (childSizing === 'FILL') {
      return true;
    } else if (childSizing === 'HUG' || childSizing === 'AUTO') {
      return false;
    }
  } else if (parentSizing === 'FIXED') {
    if (childSizing === 'FILL') {
      return true;
    } else if (childSizing === 'HUG' || childSizing === 'AUTO') {
      return false;
    }
  } else if (parentSizing === 'HUG' || parentSizing === 'AUTO') {
    if (childSizing === 'FILL') {
      return true;
    } else if (childSizing === 'HUG' || childSizing === 'AUTO') {
      return true;
    }
  }
  
  return true;
}

// Initialize plugin
figma.showUI(__html__, { width: 350, height: 500 });

console.log('Plugin initialized, setting up message handler');

let cleaningResults: CleaningResults = {
  framesAnalyzed: 0,
  framesMerged: 0,
  siblingGroupsOptimized: 0,
  siblingsRemoved: 0,
  paddingOptimized: 0,
  issues: []
};

// Store the analyzed frame for optimization
let analyzedFrame: SceneNode | null = null;
let analyzedFrameData: AnalysisResults | null = null;

// Selection change monitoring
figma.on('selectionchange', (): void => {
  const hasSelection: boolean = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({
    type: 'selection-changed',
    hasSelection: hasSelection,
    selectionCount: figma.currentPage.selection.length
  });
});

// Send initial selection state
setTimeout((): void => {
  const hasSelection: boolean = figma.currentPage.selection.length > 0;
  figma.ui.postMessage({
    type: 'selection-changed',
    hasSelection: hasSelection,
    selectionCount: figma.currentPage.selection.length
  });
}, 100);

// Message handler
figma.ui.onmessage = (msg: UIMessage): void => {
  console.log('Received message:', msg);
  
  switch (msg.type) {
    case 'analyze-selection':
      analyzeSelection();
      break;
    case 'clean-selection':
      cleanSelection();
      break;
    case 'analyze-page':
      analyzePage();
      break;
    case 'clean-page':
      cleanPage();
      break;
    case 'select-and-zoom':
      console.log('Handling select-and-zoom for nodeId:', msg.nodeId);
      figma.notify(`Debug: Received select message for ${msg.nodeId}`);
      if (msg.nodeId) {
        selectAndZoomToNode(msg.nodeId);
      } else {
        console.error('No nodeId provided in select-and-zoom message');
        figma.notify("Frame not found");
      }
      break;
    default:
      console.log('Unknown message type:', msg.type);
  }
};

// Select and zoom to node function
function selectAndZoomToNode(nodeId: string): void {
  console.log('selectAndZoomToNode called with nodeId:', nodeId);
  
  if (!nodeId) {
    console.error('No nodeId provided');
    figma.notify("Frame not found");
    return;
  }
  
  try {
    console.log('Attempting to get node by ID:', nodeId);
    const node = figma.getNodeById(nodeId);
    
    console.log('Node found:', node);
    
    if (!node || !nodeExists(node)) {
      console.error('Node not found or removed:', nodeId);
      figma.notify("Frame not found");
      return;
    }
    
    console.log('Node exists, attempting to select and zoom');
    console.log('Node details:', {
      id: node.id,
      name: safeGetNodeName(node),
      type: node.type,
      removed: node.removed
    });
    
    // Select the node
    figma.currentPage.selection = [node as SceneNode];
    console.log('Selection set, current selection:', figma.currentPage.selection.map(n => n.name));
    
    // Zoom to the node
    figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    console.log('Zoom completed');
    
  } catch (error) {
    console.error('Error in selectAndZoomToNode:', error);
    figma.notify("Frame not found");
  }
}

// Helper functions for absolute positioning support
function getLayoutChildren(node: FrameNode | GroupNode): SceneNode[] {
  if (!nodeExists(node) || !hasChildren(node)) return [];
  
  try {
    return node.children.filter((child: SceneNode): boolean => {
      if (!nodeExists(child)) return false;
      return !('layoutPositioning' in child) || child.layoutPositioning !== 'ABSOLUTE';
    });
  } catch (error) {
    return [];
  }
}

function getAbsoluteChildren(node: FrameNode | GroupNode): SceneNode[] {
  if (!nodeExists(node) || !hasChildren(node)) return [];
  
  try {
    return node.children.filter((child: SceneNode): boolean => {
      if (!nodeExists(child)) return false;
      return 'layoutPositioning' in child && child.layoutPositioning === 'ABSOLUTE';
    });
  } catch (error) {
    return [];
  }
}

function dimensionsMatch(parent: FrameNode | GroupNode, child: FrameNode | GroupNode): boolean {
  if (!nodeExists(parent) || !nodeExists(child)) return false;
  
  try {
    const parentDims = safeGetDimensions(parent);
    const childDims = safeGetDimensions(child);
    return parentDims.width === childDims.width && parentDims.height === childDims.height;
  } catch (error) {
    return false;
  }
}

// Helper functions for sibling dissolution compatibility

function siblingsHaveIdenticalAlignment(siblings: FrameNode[]): boolean {
  if (siblings.length <= 1) return true;
  
  const firstSibling = siblings[0];
  if (!hasAutoLayout(firstSibling)) return false;
  
  const referenceAlignment = {
    primary: firstSibling.primaryAxisAlignItems,
    counter: firstSibling.counterAxisAlignItems
  };
  
  for (let i = 1; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (!hasAutoLayout(sibling)) {
      return false;
    }
    
    const siblingAlignment = {
      primary: sibling.primaryAxisAlignItems,
      counter: sibling.counterAxisAlignItems
    };
    
    if (siblingAlignment.primary !== referenceAlignment.primary || 
        siblingAlignment.counter !== referenceAlignment.counter) {
      return false;
    }
  }
  
  return true;
}

function siblingsHaveIdenticalSizing(siblings: FrameNode[]): boolean {
  if (siblings.length <= 1) return true;
  
  const firstSibling = siblings[0];
  if (!hasAutoLayout(firstSibling)) return false;
  
  const referenceSizing = {
    horizontal: firstSibling.layoutSizingHorizontal,
    vertical: firstSibling.layoutSizingVertical
  };
  
  for (let i = 1; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (!hasAutoLayout(sibling)) {
      return false;
    }
    
    const siblingSizing = {
      horizontal: sibling.layoutSizingHorizontal,
      vertical: sibling.layoutSizingVertical
    };
    
    if (siblingSizing.horizontal !== referenceSizing.horizontal || 
        siblingSizing.vertical !== referenceSizing.vertical) {
      return false;
    }
  }
  
  return true;
}

function isParentSiblingCompatible(parent: FrameNode, sibling: FrameNode): boolean {
  if (!hasAutoLayout(parent) || !hasAutoLayout(sibling)) return false;
  
  const parentLayoutMode = parent.layoutMode;
  let parentPrimarySizing: string;
  let parentCounterSizing: string;
  let siblingPrimarySizing: string;
  let siblingCounterSizing: string;
  
  try {
    if (parentLayoutMode === 'VERTICAL') {
      parentPrimarySizing = parent.primaryAxisSizingMode;
      parentCounterSizing = parent.counterAxisSizingMode;
      siblingPrimarySizing = sibling.primaryAxisSizingMode;
      siblingCounterSizing = sibling.counterAxisSizingMode;
    } else if (parentLayoutMode === 'HORIZONTAL') {
      parentPrimarySizing = parent.primaryAxisSizingMode;
      parentCounterSizing = parent.counterAxisSizingMode;
      siblingPrimarySizing = sibling.primaryAxisSizingMode;
      siblingCounterSizing = sibling.counterAxisSizingMode;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
  
  const primaryCompatible = isSizingCombinationCompatible(parentPrimarySizing, siblingPrimarySizing);
  const counterCompatible = isSizingCombinationCompatible(parentCounterSizing, siblingCounterSizing);
  
  return primaryCompatible && counterCompatible;
}

function isSizingCombinationCompatible(parentSizing: string, childSizing: string): boolean {
  if (childSizing === 'FIXED') {
    return true;
  }
  
  return true;
}

function getCrossDirectionPadding(frame: FrameNode, parentLayoutMode: string): CrossDirectionPadding {
  if (!hasAutoLayout(frame)) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  
  if (parentLayoutMode === 'HORIZONTAL') {
    return { 
      top: frame.paddingTop, 
      bottom: frame.paddingBottom, 
      left: 0, 
      right: 0 
    };
  } else if (parentLayoutMode === 'VERTICAL') {
    return { 
      top: 0, 
      bottom: 0, 
      left: frame.paddingLeft, 
      right: frame.paddingRight 
    };
  }
  
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

function siblingHasZeroPadding(sibling: FrameNode): boolean {
  if (!hasAutoLayout(sibling)) return true;
  
  return sibling.paddingTop === 0 && 
         sibling.paddingBottom === 0 && 
         sibling.paddingLeft === 0 && 
         sibling.paddingRight === 0;
}

function canSiblingBeDissolvedSelectively(sibling: FrameNode, parent: FrameNode, requireZeroPadding: boolean = false): boolean {
  if (!hasAutoLayout(sibling)) {
    return false;
  }
  
  const layoutChildren = getLayoutChildren(sibling);
  if (layoutChildren.length === 0) {
    return false;
  }
  
  // PHASE 1 CRITICAL SAFETY CHECKS
  if (hasTransformOrRotation(sibling)) {
    return false;
  }
  
  if (hasComplexFills(sibling)) {
    return false;
  }
  
  if (hasComplexStrokes(sibling)) {
    return false;
  }
  
  if (hasPrototypeInteractions(sibling)) {
    return false;
  }
  
  if (hasAdvancedLayoutModes(sibling)) {
    return false;
  }
  
  const absoluteChildren = getAbsoluteChildren(sibling);
  if (absoluteChildren.length > 0) {
    return false;
  }
  
  if (requireZeroPadding && !siblingHasZeroPadding(sibling)) {
    return false;
  }
  
  if (!isParentSiblingCompatible(parent, sibling)) {
    return false;
  }
  
  const parentLayoutMode = parent.layoutMode;
  const siblingException = layoutChildren.length === 1;
  
  if (!siblingException && sibling.layoutMode !== parentLayoutMode) {
    return false;
  }
  
  const siblingSpacing = getChildSpacingInfo(sibling);
  const parentSpacing = getChildSpacingInfo(parent);
  
  if (siblingSpacing.hasAutoGap !== parentSpacing.hasAutoGap) {
    return false;
  }
  
  if (Math.abs(siblingSpacing.impliedGapPixels - parentSpacing.impliedGapPixels) > 0.01) {
    return false;
  }
  
  if (hasStroke(sibling)) {
    return false;
  }
  
  if (hasEffects(sibling)) {
    return false;
  }
  
  if (hasCornerRadius(sibling)) {
    return false;
  }
  
  if (sibling.opacity !== 1) {
    return false;
  }
  
  if ('fills' in sibling && isArrayValue(sibling.fills) && sibling.fills.length > 0) {
    const hasVisibleFills = sibling.fills.some(fill => fill.visible !== false);
    if (hasVisibleFills) {
      return false;
    }
  }
  
  if ('blendMode' in sibling && sibling.blendMode !== 'NORMAL' && sibling.blendMode !== 'PASS_THROUGH') {
    return false;
  }
  
  if ('clipsContent' in sibling && sibling.clipsContent === true) {
    return false;
  }
  
  if ('layoutGrids' in sibling && isArrayValue(sibling.layoutGrids) && sibling.layoutGrids.length > 0) {
    const hasVisibleGrids = sibling.layoutGrids.some(grid => grid.visible !== false);
    if (hasVisibleGrids) {
      return false;
    }
  }
  
  if ('exportSettings' in sibling && isArrayValue(sibling.exportSettings) && sibling.exportSettings.length > 0) {
    return false;
  }
  
  if ('componentPropertyReferences' in sibling && Object.keys(sibling.componentPropertyReferences || {}).length > 0) {
    return false;
  }
  
  if ('fillStyleId' in sibling && isStringValue(sibling.fillStyleId) && sibling.fillStyleId !== '') {
    return false;
  }
  
  if ('strokeStyleId' in sibling && isStringValue(sibling.strokeStyleId) && sibling.strokeStyleId !== '') {
    return false;
  }
  
  if ('effectStyleId' in sibling && isStringValue(sibling.effectStyleId) && sibling.effectStyleId !== '') {
    return false;
  }
  
  if ('constraints' in sibling && sibling.constraints) {
    try {
      const constraints = sibling.constraints;
      if (constraints.horizontal !== 'MIN' || constraints.vertical !== 'MIN') {
        return false;
      }
    } catch (error) {
      return false;
    }
  }
  
  if (!fillsAreCompatible(parent, sibling, false)) {
    return false;
  }
  
  return true;
}

function canAllSiblingsBeDissolvedTogether(parentFrame: FrameNode): boolean {
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return false;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return false;
  
  for (const sibling of siblingFrames) {
    if (!nodeExists(sibling)) {
      return false;
    }
    
    if (!siblingHasZeroPadding(sibling)) {
      return false;
    }
  }
  
  if (!siblingsHaveIdenticalAlignment(siblingFrames)) {
    return false;
  }
  
  if (!siblingsHaveIdenticalSizing(siblingFrames)) {
    return false;
  }
  
  for (const sibling of siblingFrames) {
    if (!isParentSiblingCompatible(parentFrame, sibling)) {
      return false;
    }
  }
  
  for (const sibling of siblingFrames) {
    if (!canSiblingBeDissolvedSelectively(sibling, parentFrame, false)) {
      return false;
    }
  }
  
  return true;
}

function dissolveAllSiblings(parentFrame: FrameNode): void {
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return;

  const referenceSibling = siblingFrames[0];
  if (nodeExists(referenceSibling) && hasAutoLayout(referenceSibling)) {
    applySiblingAlignmentInheritance(parentFrame, referenceSibling);
  }
  
  let totalChildrenPromoted = 0;
  let paddingTransferred = false;
  
  for (let i = siblingFrames.length - 1; i >= 0; i--) {
    const sibling = siblingFrames[i];
    
    if (!nodeExists(sibling)) continue;
    
    try {
      const currentParentChildren = getLayoutChildren(parentFrame);
      const siblingIndex = currentParentChildren.findIndex(child => child === sibling);
      
      if (siblingIndex === -1) {
        continue;
      }
      
      if (!paddingTransferred && hasAutoLayout(sibling)) {
        const parentLayoutMode = parentFrame.layoutMode;
        const siblingPadding = getCrossDirectionPadding(sibling, parentLayoutMode);
        
        if (siblingPadding.top > 0 || siblingPadding.bottom > 0 || siblingPadding.left > 0 || siblingPadding.right > 0) {
          parentFrame.paddingLeft += siblingPadding.left;
          parentFrame.paddingRight += siblingPadding.right;
          parentFrame.paddingTop += siblingPadding.top;
          parentFrame.paddingBottom += siblingPadding.bottom;
          
          paddingTransferred = true;
        }
      }
      
      if (hasChildren(sibling)) {
        const childrenToMove = [...sibling.children].filter(child => nodeExists(child));
        
        for (let j = childrenToMove.length - 1; j >= 0; j--) {
          const child = childrenToMove[j];
          if (nodeExists(child) && nodeExists(parentFrame)) {
            parentFrame.insertChild(siblingIndex, child);
            totalChildrenPromoted++;
          }
        }
      }
      
      if (nodeExists(sibling)) {
        sibling.remove();
        cleaningResults.siblingsRemoved++;
      }
      
    } catch (error) {
      // Silent fail
    }
  }
  
  cleaningResults.siblingGroupsOptimized++;
}

function applySiblingAlignmentInheritance(parentFrame: FrameNode, sibling: FrameNode): void {
  if (!nodeExists(parentFrame) || !nodeExists(sibling)) return;
  if (!hasAutoLayout(parentFrame) || !hasAutoLayout(sibling)) return;
  
  const parentLayoutMode = parentFrame.layoutMode;
  let parentPrimarySizing: string;
  let parentCounterSizing: string;
  let siblingPrimarySizing: string;
  let siblingCounterSizing: string;
  
  try {
    if (parentLayoutMode === 'VERTICAL') {
      parentPrimarySizing = parentFrame.primaryAxisSizingMode;
      parentCounterSizing = parentFrame.counterAxisSizingMode;
      siblingPrimarySizing = sibling.primaryAxisSizingMode;
      siblingCounterSizing = sibling.counterAxisSizingMode;
    } else if (parentLayoutMode === 'HORIZONTAL') {
      parentPrimarySizing = parentFrame.primaryAxisSizingMode;
      parentCounterSizing = parentFrame.counterAxisSizingMode;
      siblingPrimarySizing = sibling.primaryAxisSizingMode;
      siblingCounterSizing = sibling.counterAxisSizingMode;
    } else {
      return;
    }
  } catch (error) {
    return;
  }
  
  const inheritPrimaryAxis = shouldInheritAlignment(parentPrimarySizing, siblingPrimarySizing, 'primary');
  const inheritCounterAxis = shouldInheritAlignment(parentCounterSizing, siblingCounterSizing, 'counter');
  
  if (inheritPrimaryAxis) {
    parentFrame.primaryAxisAlignItems = sibling.primaryAxisAlignItems;
  }
  
  if (inheritCounterAxis) {
    parentFrame.counterAxisAlignItems = sibling.counterAxisAlignItems;
  }
}

function dissolveSingleSibling(sibling: FrameNode, parent: FrameNode, shouldTransferPadding: boolean = true): void {
  if (!nodeExists(sibling) || !nodeExists(parent)) {
    return;
  }
  
  applySiblingAlignmentInheritance(parent, sibling);
  
  const parentChildren = getLayoutChildren(parent);
  const siblingIndex = parentChildren.findIndex(child => child === sibling);
  
  if (siblingIndex === -1) {
    return;
  }
  
  if (shouldTransferPadding && hasAutoLayout(sibling)) {
    const parentLayoutMode = parent.layoutMode;
    const siblingPadding = getCrossDirectionPadding(sibling, parentLayoutMode);
    
    if (siblingPadding.top > 0 || siblingPadding.bottom > 0 || siblingPadding.left > 0 || siblingPadding.right > 0) {
      parent.paddingLeft += siblingPadding.left;
      parent.paddingRight += siblingPadding.right;
      parent.paddingTop += siblingPadding.top;
      parent.paddingBottom += siblingPadding.bottom;
    }
  }
  
  const siblingChildren: SceneNode[] = [];
  
  if (hasChildren(sibling)) {
    const children = [...sibling.children].filter(child => nodeExists(child));
    
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      siblingChildren.unshift(child);
      
      try {
        if (nodeExists(child) && nodeExists(parent)) {
          parent.insertChild(siblingIndex, child);
        }
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  try {
    sibling.remove();
    cleaningResults.siblingsRemoved++;
  } catch (error) {
    return;
  }
}

function optimizeSiblingsSelectively(parentFrame: FrameNode): void {
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return;
  
  siblingFrames.forEach(sibling => {
    if ('layoutPositioning' in sibling && sibling.layoutPositioning === 'ABSOLUTE') {
      if ('constraints' in sibling && sibling.constraints) {
        const constraints = sibling.constraints;
        const hasScaleConstraints = constraints.horizontal === 'SCALE' || constraints.vertical === 'SCALE';
        
        if (hasScaleConstraints) {
          sibling.constraints = {horizontal: 'MIN', vertical: 'MIN'};
        }
      }
    }
  });
  
  if (canAllSiblingsBeDissolvedTogether(parentFrame)) {
    dissolveAllSiblings(parentFrame);
    return;
  }
  
  let dissolvedCount = 0;
  let paddingTransferred = false;
  
  for (let i = siblingFrames.length - 1; i >= 0; i--) {
    const sibling = siblingFrames[i];
    
    if (!nodeExists(sibling)) continue;
    
    if (canSiblingBeDissolvedSelectively(sibling, parentFrame, true)) {
      try {
        dissolveSingleSibling(sibling, parentFrame, !paddingTransferred);
        dissolvedCount++;
        paddingTransferred = true;
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  if (dissolvedCount > 0) {
    cleaningResults.siblingGroupsOptimized++;
  }
}

// Analysis functions
function analyzeSelection(): void {
  const selection: readonly SceneNode[] = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'analysis-result',
      message: 'Please select some frames first',
      results: null
    });
    figma.notify("Please select some frames first");
    return;
  }
  
  // Store the first selected frame for later optimization
  analyzedFrame = selection[0];
  
  const results: AnalysisResults = analyzeFrames(selection);
  
  // Add frame information to results
  results.frameName = safeGetNodeName(selection[0]);
  results.frameId = selection[0].id;
  
  // Store the analysis data globally
  analyzedFrameData = results;
  
  figma.ui.postMessage({
    type: 'analysis-result',
    message: 'Analysis complete',
    results: results
  });
}

function analyzePage(): void {
  const results: AnalysisResults = analyzeFrames(figma.currentPage.children);
  figma.ui.postMessage({
    type: 'analysis-result',
    message: 'Page analysis complete',
    results: results
  });
}

function cleanSelection(): void {
  // If we have a stored analyzed frame, use that instead of current selection
  if (analyzedFrame && nodeExists(analyzedFrame)) {
    cleanFrames([analyzedFrame]);
    
    // Clear the stored frame after optimization
    analyzedFrame = null;
    analyzedFrameData = null;
    return;
  }
  
  // Fallback to current selection if no analyzed frame is stored
  const selection: readonly SceneNode[] = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'cleaning-result',
      results: { framesMerged: 0, message: 'Please select some frames first' }
    });
    figma.notify("Please select some frames first");
    return;
  }
  
  cleanFrames(selection);
}

function cleanPage(): void {
  cleanFrames(figma.currentPage.children);
}

function analyzeFrames(nodes: readonly SceneNode[]): AnalysisResults {
  const results: AnalysisResults = {
    totalFrames: 0,
    mergeableFrames: 0,
    optimizableSiblingGroups: 0,
    paddingOptimizations: 0,
    removableFrames: 0,
    removableFrameNames: [],
    removableNodeIds: [],
    frameName: '',
    frameId: '',
    issues: []
  };
  
  function analyzeNode(node: SceneNode): void {
    if (!nodeExists(node)) return;
    
    if (node.type === 'COMPONENT') return;
    
    if (isFrameOrGroup(node)) {
      results.totalFrames++;
      
      if (canBeMerged(node) && nodeExists(node)) {
        results.mergeableFrames++;
        results.removableFrames++;
        results.removableFrameNames.push(safeGetNodeName(node));
        results.removableNodeIds.push(node.id);
      }
      
      if (isFrameNode(node) && hasAutoLayout(node) && nodeExists(node)) {
        const layoutChildren = getLayoutChildren(node);
        const siblingFrames = layoutChildren.filter(child => isFrameNode(child) && nodeExists(child)) as FrameNode[];
        
        if (siblingFrames.length > 0) {
          if (canAllSiblingsBeDissolvedTogether(node)) {
            results.optimizableSiblingGroups++;
            siblingFrames.forEach(sibling => {
              if (nodeExists(sibling)) {
                results.removableFrames++;
                results.removableFrameNames.push(safeGetNodeName(sibling));
                results.removableNodeIds.push(sibling.id);
              }
            });
          } else {
            let hasPartialOptimization = false;
            siblingFrames.forEach(sibling => {
              if (nodeExists(sibling) && canSiblingBeDissolvedSelectively(sibling, node, true)) {
                if (!hasPartialOptimization) {
                  results.optimizableSiblingGroups++;
                  hasPartialOptimization = true;
                }
                results.removableFrames++;
                results.removableFrameNames.push(safeGetNodeName(sibling));
                results.removableNodeIds.push(sibling.id);
              }
            });
          }
        }
      }
      
      if (hasPaddingOptimization(node)) {
        results.paddingOptimizations++;
      }
      
      const issues = checkForIssues(node);
      results.issues.push(...issues);
      
      if (hasChildren(node) && nodeExists(node)) {
        try {
          const childrenCopy = [...node.children];
          const existingChildren = childrenCopy.filter(child => nodeExists(child));
          
          existingChildren.forEach(child => {
            if (nodeExists(child)) {
              analyzeNode(child);
            }
          });
        } catch (error) {
          // Silent fail
        }
      }
    }
  }
  
  nodes.forEach(node => {
    if (nodeExists(node)) {
      try {
        analyzeNode(node);
      } catch (error) {
        // Silent fail
      }
    }
  });
  
  return results;
}

function cleanFrames(nodes: readonly SceneNode[]): void {
  cleaningResults = {
    framesAnalyzed: 0,
    framesMerged: 0,
    siblingGroupsOptimized: 0,
    siblingsRemoved: 0,
    paddingOptimized: 0,
    issues: []
  };
  
  function cleanNode(node: SceneNode): void {
    if (!nodeExists(node)) return;
    
    if (node.type === 'COMPONENT') return;
    
    if (isFrameOrGroup(node)) {
      cleaningResults.framesAnalyzed++;
      
      if (hasChildren(node) && nodeExists(node)) {
        try {
          const childrenCopy = [...node.children];
          const existingChildren = childrenCopy.filter(child => nodeExists(child));
          
          existingChildren.forEach(child => {
            if (nodeExists(child)) {
              cleanNode(child);
            }
          });
        } catch (error) {
          // Silent fail
        }
      }
      
      if (nodeExists(node) && isFrameNode(node) && hasAutoLayout(node)) {
        try {
          optimizeSiblingsSelectively(node);
        } catch (error) {
          // Silent fail
        }
      }
      
      if (nodeExists(node) && canBeMerged(node)) {
        try {
          mergeFrame(node);
        } catch (error) {
          // Silent fail
        }
      }
    }
  }
  
  nodes.forEach(node => cleanNode(node));
  
  figma.ui.postMessage({
    type: 'cleaning-result',
    results: cleaningResults
  });
  
  const totalFramesRemoved = cleaningResults.framesMerged + cleaningResults.siblingsRemoved;
  
  if (totalFramesRemoved === 0) {
    figma.notify("Your layers are fully optimized!");
  } else {
    figma.notify(`${totalFramesRemoved} frame${totalFramesRemoved !== 1 ? 's' : ''} removed`);
  }
}

// Core logic functions
function canBeMerged(node: FrameNode | GroupNode): boolean {
  if (!isFrameOrGroup(node)) return false;
  
  const layoutChildren: SceneNode[] = getLayoutChildren(node);
  
  if (layoutChildren.length !== 1) return false;
  
  const child = layoutChildren[0];
  if (!isFrameOrGroup(child)) return false;
  
  return canSafelyMerge(node, child);
}

function canSafelyMerge(parent: FrameNode | GroupNode, child: FrameNode | GroupNode): boolean {
  const sameDimensions: boolean = dimensionsMatch(parent, child);
  
  if (isGroupNode(parent) || isGroupNode(child)) {
    return false;
  }
  
  if (!hasAutoLayout(parent) || !hasAutoLayout(child)) {
    return false;
  }
  
  // PHASE 1 CRITICAL SAFETY CHECKS
  if (hasTransformOrRotation(parent)) {
    return false;
  }
  
  if (hasComplexFills(parent)) {
    return false;
  }
  
  if (hasComplexStrokes(parent)) {
    return false;
  }
  
  if (hasPrototypeInteractions(parent)) {
    return false;
  }
  
  if (hasAdvancedLayoutModes(parent)) {
    return false;
  }
  
  if (hasTransformOrRotation(child)) {
    return false;
  }
  
  if (hasComplexFills(child)) {
    return false;
  }
  
  if (hasComplexStrokes(child)) {
    return false;
  }
  
  if (hasPrototypeInteractions(child)) {
    return false;
  }
  
  if (hasAdvancedLayoutModes(child)) {
    return false;
  }
  
  // PHASE 3: Child FIXED Sizing Handling
  if (isFrameNode(child) && hasAutoLayout(child)) {
    const childHasFixedSizing = child.layoutSizingHorizontal === 'FIXED' || child.layoutSizingVertical === 'FIXED';
    
    if (childHasFixedSizing) {
      const dimensionsCompatible = sameDimensions;
      
      const alignmentCompatible = (
        parent.primaryAxisAlignItems === child.primaryAxisAlignItems &&
        parent.counterAxisAlignItems === child.counterAxisAlignItems
      );
      
      if (!dimensionsCompatible && !alignmentCompatible) {
        return false;
      }
    }
  }
  
  if (!fillsAreCompatible(parent, child, sameDimensions)) {
    return false;
  }
  
  if (hasStroke(child) && !sameDimensions) {
    return false;
  }
  if (hasEffects(child) && !sameDimensions) {
    return false;
  }
  if (hasCornerRadius(child) && !sameDimensions) {
    return false;
  }
  if (child.opacity !== 1) {
    return false;
  }
  
  return true;
}

function fillsAreCompatible(parent: FrameNode | GroupNode, child: FrameNode | GroupNode, sameDimensions: boolean = false): boolean {
  const parentFills = ('fills' in parent) ? parent.fills : [];
  const childFills = ('fills' in child) ? child.fills : [];
  
  if (!childFills || !isArrayValue(childFills) || childFills.length === 0) return true;
  if (!parentFills || !isArrayValue(parentFills) || parentFills.length === 0) return true;
  if (sameDimensions && childFills && isArrayValue(childFills) && childFills.length > 0) return true;
  
  const identical = JSON.stringify(parentFills) === JSON.stringify(childFills);
  return identical;
}

function hasStroke(node: FrameNode | GroupNode): boolean {
  return ('strokes' in node) && node.strokes && isArrayValue(node.strokes) && node.strokes.length > 0;
}

function hasEffects(node: FrameNode | GroupNode): boolean {
  return ('effects' in node) && node.effects && isArrayValue(node.effects) && node.effects.length > 0;
}

function hasCornerRadius(node: FrameNode | GroupNode): boolean {
  return isFrameNode(node) && 
         'cornerRadius' in node && 
         isNumberValue(node.cornerRadius) && 
         node.cornerRadius > 0;
}

function hasPaddingOptimization(node: FrameNode | GroupNode): boolean {
  if (!isFrameNode(node) || !hasAutoLayout(node)) return false;
  
  const layoutChildren: SceneNode[] = getLayoutChildren(node);
  
  return layoutChildren.length === 1 && 
         isFrameOrGroup(layoutChildren[0]) && 
         (node.paddingLeft > 0 || node.paddingRight > 0 || 
          node.paddingTop > 0 || node.paddingBottom > 0);
}

function mergeFrame(parentFrame: FrameNode | GroupNode): void {
  if (!nodeExists(parentFrame)) return;

  const layoutChildren: SceneNode[] = getLayoutChildren(parentFrame);
  
  if (layoutChildren.length === 0) return;
  
  const childFrame = layoutChildren[0] as FrameNode | GroupNode;
  
  if (!nodeExists(childFrame)) return;
  
  if (!isFrameNode(parentFrame) || !hasAutoLayout(parentFrame)) return;
  
  const sameDimensions: boolean = dimensionsMatch(parentFrame, childFrame);
  const parentDims = safeGetDimensions(parentFrame);
  const originalWidth: number = parentDims.width;
  const originalHeight: number = parentDims.height;
  
  const originalParentPadding = {
    left: parentFrame.paddingLeft,
    right: parentFrame.paddingRight,
    top: parentFrame.paddingTop,
    bottom: parentFrame.paddingBottom
  };
  
  const combinedPadding: CombinedPadding = calculateCombinedPadding(parentFrame, childFrame);
  
  let childLayoutMode: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID' = 'NONE';
  let childSpacingInfo = {
    hasAutoGap: false,
    itemSpacing: 0,
    impliedGapPixels: 0,
    primaryAxisAlignItems: 'MIN' as 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'
  };
  let childCounterAxisAlignItems: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE' = 'MIN';
  let childPrimaryAxisSizingMode: 'FIXED' | 'AUTO' = 'AUTO';
  let childCounterAxisSizingMode: 'FIXED' | 'AUTO' = 'AUTO';
  let childFills: readonly Paint[] = [];
  
  try {
    if (isFrameNode(childFrame) && nodeExists(childFrame)) {
      childLayoutMode = childFrame.layoutMode;
      childSpacingInfo = getChildSpacingInfo(childFrame);
      childCounterAxisAlignItems = hasAutoLayout(childFrame) ? childFrame.counterAxisAlignItems : 'MIN';
      childPrimaryAxisSizingMode = hasAutoLayout(childFrame) ? childFrame.primaryAxisSizingMode : 'AUTO';
      childCounterAxisSizingMode = hasAutoLayout(childFrame) ? childFrame.counterAxisSizingMode : 'AUTO';
      if ('fills' in childFrame && isArrayValue(childFrame.fills)) {
        childFills = childFrame.fills;
      }
    }
  } catch (error) {
    return;
  }
  
  const alignmentInheritance = determineAlignmentInheritance(parentFrame, childFrame, childSpacingInfo);
  
  const grandchildren: SceneNode[] = [];
  try {
    if (nodeExists(childFrame) && hasChildren(childFrame)) {
      grandchildren.push(...childFrame.children.filter(child => nodeExists(child)));
    }
  } catch (error) {
    // Silent fail
  }
  
  let childStrokes: readonly Paint[] = [];
  let childEffects: readonly Effect[] = [];
  let childCornerRadius = 0;
  let childEffectStyleId = '';
  let childStrokeStyleId = '';
  let childFillStyleId = '';
  
  try {
    if (nodeExists(childFrame)) {
      if ('strokes' in childFrame && isArrayValue(childFrame.strokes)) {
        childStrokes = childFrame.strokes;
      }
      if ('effects' in childFrame && isArrayValue(childFrame.effects)) {
        childEffects = childFrame.effects;
      }
      if (isFrameNode(childFrame) && 'cornerRadius' in childFrame && isNumberValue(childFrame.cornerRadius)) {
        childCornerRadius = childFrame.cornerRadius;
      }
      if (isFrameNode(childFrame) && 'effectStyleId' in childFrame && isStringValue(childFrame.effectStyleId)) {
        childEffectStyleId = childFrame.effectStyleId;
      }
      if (isFrameNode(childFrame) && 'strokeStyleId' in childFrame && isStringValue(childFrame.strokeStyleId)) {
        childStrokeStyleId = childFrame.strokeStyleId;
      }
      if (isFrameNode(childFrame) && 'fillStyleId' in childFrame && isStringValue(childFrame.fillStyleId)) {
        childFillStyleId = childFrame.fillStyleId;
      }
    }
  } catch (error) {
    // Silent fail
  }
  
  let childAbsoluteElements: SceneNode[] = [];
  let parentAbsoluteElements: SceneNode[] = [];
  let originalAbsoluteStates: Array<{element: SceneNode, x: number, y: number, width: number, height: number}> = [];
  
  try {
    if (nodeExists(childFrame)) {
      childAbsoluteElements = getAbsoluteChildren(childFrame);
      
      childAbsoluteElements.forEach(element => {
        if ('constraints' in element && element.constraints) {
          const constraints = element.constraints;
          const hasScaleConstraints = constraints.horizontal === 'SCALE' || constraints.vertical === 'SCALE';
          
          if (hasScaleConstraints) {
            element.constraints = {horizontal: 'MIN', vertical: 'MIN'};
          }
        }
      });
      
      originalAbsoluteStates = childAbsoluteElements.map(element => {
        if ('x' in element && 'y' in element) {
          return {
            element,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height
          };
        }
        return null;
      }).filter(state => state !== null) as Array<{element: SceneNode, x: number, y: number, width: number, height: number}>;
    }
    if (nodeExists(parentFrame)) {
      parentAbsoluteElements = getAbsoluteChildren(parentFrame);
    }
  } catch (error) {
    // Silent fail
  }
  
  try {
    if (childLayoutMode !== 'NONE' && nodeExists(parentFrame)) {
      parentFrame.layoutMode = childLayoutMode;
      
      parentFrame.paddingLeft = combinedPadding.left;
      parentFrame.paddingRight = combinedPadding.right;
      parentFrame.paddingTop = combinedPadding.top;
      parentFrame.paddingBottom = combinedPadding.bottom;
      
      if (childSpacingInfo.hasAutoGap) {
        // Auto gap handled via alignment
      } else {
        if (childSpacingInfo.itemSpacing !== undefined && childSpacingInfo.itemSpacing !== null) {
          parentFrame.itemSpacing = childSpacingInfo.itemSpacing;
        }
      }
      
      if (alignmentInheritance.inheritPrimaryAxis || alignmentInheritance.forceSpaceBetween) {
        const newPrimaryAlign = alignmentInheritance.forceSpaceBetween ? 'SPACE_BETWEEN' : childSpacingInfo.primaryAxisAlignItems;
        parentFrame.primaryAxisAlignItems = newPrimaryAlign;
      }

      if (alignmentInheritance.inheritCounterAxis) {
        parentFrame.counterAxisAlignItems = childCounterAxisAlignItems;
      }
      
      parentFrame.primaryAxisSizingMode = childPrimaryAxisSizingMode;
      parentFrame.counterAxisSizingMode = childCounterAxisSizingMode;
    }
    else if (nodeExists(parentFrame)) {
      parentFrame.paddingLeft = combinedPadding.left;
      parentFrame.paddingRight = combinedPadding.right;
      parentFrame.paddingTop = combinedPadding.top;
      parentFrame.paddingBottom = combinedPadding.bottom;
    }
  } catch (error) {
    return;
  }
  
  if (isFrameNode(childFrame) && nodeExists(childFrame)) {
    applyLayoutSizingInheritance(parentFrame, childFrame, grandchildren);
  }
  
  grandchildren.forEach((grandchild: SceneNode): void => {
    if (!nodeExists(grandchild)) return;
    
    try {
      if (nodeExists(parentFrame) && nodeExists(grandchild)) {
        parentFrame.appendChild(grandchild);
      }
    } catch (error) {
      // Silent fail
    }
  });
  
  originalAbsoluteStates.forEach((originalState): void => {
    const element = originalState.element;
    if (!nodeExists(element) || !('x' in element) || !('y' in element)) return;
    
    try {
      if (nodeExists(parentFrame)) {
        const newX = originalState.x + originalParentPadding.left;
        const newY = originalState.y + originalParentPadding.top;
        
        if ('constraints' in element && element.constraints) {
          element.constraints = {horizontal: 'MIN', vertical: 'MIN'};
        }
        
        if ('resize' in element && typeof element.resize === 'function') {
          element.resize(originalState.width, originalState.height);
        }
        
        element.x = newX;
        element.y = newY;
        
        parentFrame.appendChild(element);
      }
    } catch (error) {
      // Silent fail
    }
  });
  
  try {
    if (nodeExists(childFrame)) {
      childFrame.remove();
    }
  } catch (error) {
    // Silent fail
  }
  
  try {
    if (nodeExists(parentFrame)) {
      parentAbsoluteElements.forEach((element: SceneNode): void => {
        if (nodeExists(element) && nodeExists(parentFrame)) {
          parentFrame.appendChild(element);
        }
      });
    }
  } catch (error) {
    // Silent fail
  }
  
  try {
    if (nodeExists(parentFrame)) {
      const currentDims = safeGetDimensions(parentFrame);
      if (currentDims.width !== originalWidth || currentDims.height !== originalHeight) {
        parentFrame.resize(originalWidth, originalHeight);
      }
    }
  } catch (error) {
    // Silent fail
  }
  
  if (sameDimensions && nodeExists(parentFrame)) {
    try {
      if (isStringValue(childEffectStyleId) && childEffectStyleId !== '') {
        if (isFrameNode(parentFrame) && 'effectStyleId' in parentFrame) {
          parentFrame.effectStyleId = childEffectStyleId;
        }
      } else if (childEffects.length > 0) {
        if ('effects' in parentFrame) {
          parentFrame.effects = childEffects;
        }
      }
      
      if (isStringValue(childStrokeStyleId) && childStrokeStyleId !== '') {
        if (isFrameNode(parentFrame) && 'strokeStyleId' in parentFrame) {
          parentFrame.strokeStyleId = childStrokeStyleId;
        }
      } else if (childStrokes.length > 0) {
        if ('strokes' in parentFrame) {
          parentFrame.strokes = childStrokes;
        }
      }
      
      if (isNumberValue(childCornerRadius) && childCornerRadius > 0) {
        if (isFrameNode(parentFrame) && 'cornerRadius' in parentFrame) {
          parentFrame.cornerRadius = childCornerRadius;
        }
      }
      
      if ((!('fills' in parentFrame) || !parentFrame.fills || !isArrayValue(parentFrame.fills) || parentFrame.fills.length === 0) && 
          (childFills.length > 0 || (isStringValue(childFillStyleId) && childFillStyleId !== ''))) {
        
        if (isStringValue(childFillStyleId) && childFillStyleId !== '') {
          if (isFrameNode(parentFrame) && 'fillStyleId' in parentFrame) {
            parentFrame.fillStyleId = childFillStyleId;
          }
        } else if (childFills.length > 0) {
          if ('fills' in parentFrame) {
            parentFrame.fills = childFills;
          }
        }
      }
      else if (isStringValue(childFillStyleId) && childFillStyleId !== '' &&
               ('fills' in parentFrame) && parentFrame.fills && isArrayValue(parentFrame.fills) && parentFrame.fills.length > 0) {
        if (isFrameNode(parentFrame) && 'fillStyleId' in parentFrame) {
          parentFrame.fillStyleId = childFillStyleId;
          if ('fills' in parentFrame) {
            parentFrame.fills = [];
          }
        }
      }
    } catch (error) {
      // Silent fail
    }
  } else if (nodeExists(parentFrame)) {
    if ((!('fills' in parentFrame) || !parentFrame.fills || !isArrayValue(parentFrame.fills) || parentFrame.fills.length === 0) && 
        (childFills.length > 0 || (isStringValue(childFillStyleId) && childFillStyleId !== ''))) {
      try {
        if (isStringValue(childFillStyleId) && childFillStyleId !== '') {
          if (isFrameNode(parentFrame) && 'fillStyleId' in parentFrame) {
            parentFrame.fillStyleId = childFillStyleId;
          }
        } else if (childFills.length > 0) {
          if ('fills' in parentFrame) {
            parentFrame.fills = childFills;
          }
        }
      } catch (error) {
        // Silent fail
      }
    }
  }
  
  cleaningResults.framesMerged++;
  cleaningResults.paddingOptimized++;
}

function calculateCombinedPadding(parent: FrameNode | GroupNode, child: FrameNode | GroupNode): CombinedPadding {
  const parentPadding = {
    left: isFrameNode(parent) && hasAutoLayout(parent) ? parent.paddingLeft : 0,
    right: isFrameNode(parent) && hasAutoLayout(parent) ? parent.paddingRight : 0,
    top: isFrameNode(parent) && hasAutoLayout(parent) ? parent.paddingTop : 0,
    bottom: isFrameNode(parent) && hasAutoLayout(parent) ? parent.paddingBottom : 0
  };
  
  const childPadding = {
    left: isFrameNode(child) && hasAutoLayout(child) ? child.paddingLeft : 0,
    right: isFrameNode(child) && hasAutoLayout(child) ? child.paddingRight : 0,
    top: isFrameNode(child) && hasAutoLayout(child) ? child.paddingTop : 0,
    bottom: isFrameNode(child) && hasAutoLayout(child) ? child.paddingBottom : 0
  };
  
  return {
    left: parentPadding.left + childPadding.left,
    right: parentPadding.right + childPadding.right,
    top: parentPadding.top + childPadding.top,
    bottom: parentPadding.bottom + childPadding.bottom
  };
}

function checkForIssues(node: FrameNode | GroupNode): Array<{node: string; issue: string}> {
  const issues: Array<{node: string; issue: string}> = [];
  
  const layoutChildren: SceneNode[] = getLayoutChildren(node);
  
  if (layoutChildren.length === 1 && isFrameOrGroup(layoutChildren[0])) {
    const child = layoutChildren[0];
    
    if (!canSafelyMerge(node, child)) {
      const sameDimensions: boolean = dimensionsMatch(node, child);
      let reason = 'Cannot merge: ';
      
      if (hasTransformOrRotation(node) || hasTransformOrRotation(child)) reason += 'transforms/rotation detected, ';
      if (hasComplexFills(node) || hasComplexFills(child)) reason += 'gradients/images detected, ';
      if (hasComplexStrokes(node) || hasComplexStrokes(child)) reason += 'complex strokes detected, ';
      if (hasPrototypeInteractions(node) || hasPrototypeInteractions(child)) reason += 'prototype interactions detected, ';
      if (hasAdvancedLayoutModes(node) || hasAdvancedLayoutModes(child)) reason += 'advanced layout modes detected, ';
      
      if (!fillsAreCompatible(node, child, sameDimensions)) reason += 'incompatible fills, ';
      if (hasStroke(child) && !sameDimensions) reason += 'child has stroke (different dimensions), ';
      if (hasEffects(child) && !sameDimensions) reason += 'child has effects (different dimensions), ';
      if (hasCornerRadius(child) && !sameDimensions) reason += 'child has corner radius (different dimensions), ';
      if (child.opacity !== 1) reason += 'child has opacity, ';
      
      if (reason !== 'Cannot merge: ') {
        issues.push({
          node: safeGetNodeName(node),
          issue: reason.slice(0, -2)
        });
      }
    }
  }
  
  return issues;
}