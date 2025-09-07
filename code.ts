/// <reference types="@figma/plugin-typings" />

// Frame Cleaner Plugin - Production Version with Critical Fixes
// Features: Error collection, memory leak fixes, improved UX

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
  criticalErrors: string[];  // NEW: User-facing errors
  warnings: string[];       // NEW: Non-blocking issues
}

interface InheritanceDetails {
  children: number;
  padding: string;
  alignment: string;
  sizingMode: string;
  itemSpacing: string;
  layoutMode: string;
}

interface RemovableFrameInfo {
  name: string;
  nodeId: string;
  parentName: string;
  inheritance: InheritanceDetails;
}

interface AnalysisResults {
  totalFrames: number;
  mergeableFrames: number;
  optimizableSiblingGroups: number;
  paddingOptimizations: number;
  removableFrames: number;
  removableFrameInfos: RemovableFrameInfo[];
  frameName: string;
  frameId: string;
  issues: Array<{
    node: string;
    issue: string;
  }>;
}

interface OptimizationResults extends AnalysisResults {
  criticalErrors: string[];
  warnings: string[];
  framesRemoved: number;
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
    deepOptimize?: boolean;
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

// Enhanced padding helper functions for improved sibling dissolution
function getMainAxisPadding(frame: FrameNode, parentLayoutMode: string): {start: number, end: number} {
  if (!hasAutoLayout(frame)) {
    return { start: 0, end: 0 };
  }
  
  if (parentLayoutMode === 'HORIZONTAL') {
    return { start: frame.paddingLeft, end: frame.paddingRight };
  } else if (parentLayoutMode === 'VERTICAL') {
    return { start: frame.paddingTop, end: frame.paddingBottom };
  }
  
  return { start: 0, end: 0 };
}

function siblingsHaveZeroMainAxisPadding(siblings: FrameNode[], parentLayoutMode: string): boolean {
  return siblings.every(sibling => {
    if (!nodeExists(sibling) || !hasAutoLayout(sibling)) return true;
    
    const mainPadding = getMainAxisPadding(sibling, parentLayoutMode);
    return mainPadding.start === 0 && mainPadding.end === 0;
  });
}

function siblingsHaveIdenticalCrossAxisPadding(siblings: FrameNode[], parentLayoutMode: string): boolean {
  if (siblings.length === 0) return true;
  
  // Find first sibling with auto layout to establish reference
  const referenceSibling = siblings.find(sibling => nodeExists(sibling) && hasAutoLayout(sibling));
  if (!referenceSibling) return true;
  
  const referenceCrossPadding = getCrossDirectionPadding(referenceSibling, parentLayoutMode);
  
  return siblings.every(sibling => {
    if (!nodeExists(sibling) || !hasAutoLayout(sibling)) return true;
    
    const crossPadding = getCrossDirectionPadding(sibling, parentLayoutMode);
    return crossPadding.top === referenceCrossPadding.top &&
           crossPadding.bottom === referenceCrossPadding.bottom &&
           crossPadding.left === referenceCrossPadding.left &&
           crossPadding.right === referenceCrossPadding.right;
  });
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

function siblingAlignmentMatchesParent(sibling: FrameNode, parent: FrameNode): boolean {
  if (!hasAutoLayout(sibling) || !hasAutoLayout(parent)) return false;
  
  return sibling.primaryAxisAlignItems === parent.primaryAxisAlignItems &&
         sibling.counterAxisAlignItems === parent.counterAxisAlignItems;
}

// Helper functions for fixed width checking
function hasFixedSizing(node: FrameNode): boolean {
  if (!hasAutoLayout(node)) return false;
  
  return node.primaryAxisSizingMode === 'FIXED' || 
         node.counterAxisSizingMode === 'FIXED' ||
         node.layoutSizingHorizontal === 'FIXED' || 
         node.layoutSizingVertical === 'FIXED';
}

function siblingHasZeroPadding(sibling: FrameNode): boolean {
  if (!hasAutoLayout(sibling)) return true;
  
  return sibling.paddingTop === 0 && 
         sibling.paddingBottom === 0 && 
         sibling.paddingLeft === 0 && 
         sibling.paddingRight === 0;
}

// Inheritance detail calculation functions
function calculateInheritanceDetails(frame: FrameNode | GroupNode, parent: FrameNode | GroupNode): InheritanceDetails {
  const details: InheritanceDetails = {
    children: 0,
    padding: '',
    alignment: '',
    sizingMode: '',
    itemSpacing: '',
    layoutMode: ''
  };

  try {
    // Calculate children count
    if (hasChildren(frame)) {
      details.children = getLayoutChildren(frame).length;
    }

    // Calculate padding inheritance
    if (isFrameNode(frame) && isFrameNode(parent) && hasAutoLayout(frame) && hasAutoLayout(parent)) {
      const combinedPadding = calculateCombinedPadding(parent, frame);
      const currentParentPadding = {
        left: parent.paddingLeft,
        right: parent.paddingRight,
        top: parent.paddingTop,
        bottom: parent.paddingBottom
      };
      
      const addedPadding = {
        left: combinedPadding.left - currentParentPadding.left,
        right: combinedPadding.right - currentParentPadding.right,
        top: combinedPadding.top - currentParentPadding.top,
        bottom: combinedPadding.bottom - currentParentPadding.bottom
      };

      if (addedPadding.left > 0 || addedPadding.right > 0 || addedPadding.top > 0 || addedPadding.bottom > 0) {
        details.padding = `+${addedPadding.top}px, +${addedPadding.right}px, +${addedPadding.bottom}px, +${addedPadding.left}px`;
      }

      // Calculate alignment inheritance
      const childSpacingInfo = getChildSpacingInfo(frame);
      const alignmentInheritance = determineAlignmentInheritance(parent, frame, childSpacingInfo);
      
      if (alignmentInheritance.inheritPrimaryAxis) {
        details.alignment = `${frame.primaryAxisAlignItems}`;
      }
      if (alignmentInheritance.inheritCounterAxis) {
        details.alignment += details.alignment ? `, ${frame.counterAxisAlignItems}` : `${frame.counterAxisAlignItems}`;
      }

      // Calculate sizing mode inheritance
      details.sizingMode = `${frame.primaryAxisSizingMode}, ${frame.counterAxisSizingMode}`;

      // Calculate item spacing inheritance
      if (childSpacingInfo.itemSpacing > 0) {
        details.itemSpacing = `${childSpacingInfo.itemSpacing}px`;
      }

      // Calculate layout mode inheritance
      if (frame.layoutMode !== 'NONE') {
        details.layoutMode = frame.layoutMode;
      }
    }
  } catch (error) {
    // Silent fail, return default values
  }

  return details;
}

function getParentFrame(node: SceneNode): FrameNode | null {
  try {
    if (!nodeExists(node) || !node.parent) return null;
    
    // Check if parent is a SceneNode first, then check if it's a FrameNode
    const parent = node.parent;
    if ('type' in parent && parent.type === 'FRAME') {
      return parent as FrameNode;
    }
    
    return null;
  } catch (error) {
    return null;
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
    if (!nodeExists(grandchild)) return;
    
    // Only apply to nodes that have layout sizing properties (includes text, shapes, components, etc.)
    if (!('layoutSizingHorizontal' in grandchild) || !('layoutSizingVertical' in grandchild)) return;
    
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
    // CRITICAL FIX: Handle auto gap within single child merge
    if (childSpacingInfo?.hasAutoGap) {
      const layoutModesDiffer = parentLayoutMode !== childLayoutMode;
      
      const result = { 
        inheritPrimaryAxis: true, 
        inheritCounterAxis: layoutModesDiffer,
        forceSpaceBetween: true 
      };
      return result;
    }
    
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
    const layoutModesDiffer = parentLayoutMode !== childLayoutMode;
    
    const result = { 
      inheritPrimaryAxis: true, 
      inheritCounterAxis: layoutModesDiffer,
      forceSpaceBetween: true 
    };
    return result;
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

function canSiblingBeDissolvedSelectively(sibling: FrameNode, parent: FrameNode, requireZeroPadding: boolean = false): boolean {
  if (!hasAutoLayout(sibling)) {
    return false;
  }
  
  const layoutChildren = getLayoutChildren(sibling);
  if (layoutChildren.length === 0) {
    return false;
  }
  
  // Require sibling alignment to match parent alignment
  if (!siblingAlignmentMatchesParent(sibling, parent)) {
    return false;
  }
  
  // Check for fixed width/sizing unless deep optimize is enabled
  if (!deepOptimizeEnabled && hasFixedSizing(sibling)) {
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

// Enhanced sibling dissolution validation with improved padding logic
function canAllSiblingsBeDissolvedTogether(parentFrame: FrameNode): boolean {
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return false;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return false;
  
  // Check for fixed width/sizing unless deep optimize is enabled
  if (!deepOptimizeEnabled) {
    for (const sibling of siblingFrames) {
      if (hasFixedSizing(sibling)) {
        return false;
      }
    }
  }
  
  const parentLayoutMode = parentFrame.layoutMode;
  
  // Check for zero main-axis padding across all siblings
  if (!siblingsHaveZeroMainAxisPadding(siblingFrames, parentLayoutMode)) {
    return false;
  }
  
  // Check for identical cross-axis padding across all siblings
  if (!siblingsHaveIdenticalCrossAxisPadding(siblingFrames, parentLayoutMode)) {
    return false;
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
        
        // Apply sizing inheritance BEFORE moving children
        if (isFrameNode(sibling)) {
          applyLayoutSizingInheritance(parentFrame, sibling, childrenToMove);
        }
        
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
      const errorMsg = `Failed to dissolve sibling "${safeGetNodeName(sibling)}"`;
      cleaningResults.criticalErrors.push(errorMsg);
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
    
    // Apply sizing inheritance BEFORE moving children
    if (isFrameNode(sibling)) {
      applyLayoutSizingInheritance(parent, sibling, children);
    }
    
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      siblingChildren.unshift(child);
      
      try {
        if (nodeExists(child) && nodeExists(parent)) {
          parent.insertChild(siblingIndex, child);
        }
      } catch (error) {
        const errorMsg = `Failed to move child "${safeGetNodeName(child)}"`;
        cleaningResults.warnings.push(errorMsg);
      }
    }
  }
  
  try {
    sibling.remove();
    cleaningResults.siblingsRemoved++;
  } catch (error) {
    const errorMsg = `Failed to remove sibling "${safeGetNodeName(sibling)}"`;
    cleaningResults.criticalErrors.push(errorMsg);
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
    try {
      dissolveAllSiblings(parentFrame);
    } catch (error) {
      const errorMsg = `Failed to dissolve siblings in "${safeGetNodeName(parentFrame)}"`;
      cleaningResults.criticalErrors.push(errorMsg);
    }
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
        const errorMsg = `Failed to dissolve sibling "${safeGetNodeName(sibling)}"`;
        cleaningResults.warnings.push(errorMsg);
      }
    }
  }
  
  if (dissolvedCount > 0) {
    cleaningResults.siblingGroupsOptimized++;
  }
}

// Initialize plugin
figma.showUI(__html__, { width: 350, height: 600 });

console.log('Frame Cleaner Plugin - Fixed Version initialized');

// Deep optimize setting - enabled by default for v1
let deepOptimizeEnabled: boolean = true;

let cleaningResults: CleaningResults = {
  framesAnalyzed: 0,
  framesMerged: 0,
  siblingGroupsOptimized: 0,
  siblingsRemoved: 0,
  paddingOptimized: 0,
  issues: [],
  criticalErrors: [],
  warnings: []
};

// Store frames with active temporary strokes for cleanup
let framesWithActiveStrokes: Map<string, {
  node: FrameNode;
  originalStrokes: readonly Paint[];
  originalStrokeWeight: number;
  originalStrokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  originalStrokeStyleId: string;
  timeoutId?: number;
  fadeTimeoutId?: number;
}> = new Map();

// Track all active timeouts for proper cleanup
let activeStrokeTimeouts: Set<number> = new Set();

// FIXED: Async memory leak cleanup function
async function cleanupActiveStrokes(): Promise<void> {
  // Clear all pending timeouts first
  activeStrokeTimeouts.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  activeStrokeTimeouts.clear();

  // More conservative dead node detection
  const deadNodeIds: string[] = [];
  framesWithActiveStrokes.forEach((data, nodeId) => {
    try {
      // Only remove if node is definitely inaccessible
      const testId = data.node.id;
      if (data.node.removed) {
        deadNodeIds.push(nodeId);
      }
    } catch (error) {
      // Node is definitely dead if we can't access basic properties
      deadNodeIds.push(nodeId);
    }
  });
  deadNodeIds.forEach(nodeId => framesWithActiveStrokes.delete(nodeId));

  // Continue with existing restoration logic for live nodes - NOW ASYNC
  const restorationPromises: Promise<void>[] = [];
  
  framesWithActiveStrokes.forEach((data, nodeId) => {
    const restorationPromise = (async () => {
      try {
        const { node, originalStrokes, originalStrokeWeight, originalStrokeAlign, originalStrokeStyleId, timeoutId, fadeTimeoutId } = data;
        
        // Clear any pending timeouts for this specific node
        if (timeoutId) {
          clearTimeout(timeoutId);
          activeStrokeTimeouts.delete(timeoutId);
        }
        if (fadeTimeoutId) {
          clearTimeout(fadeTimeoutId);
          activeStrokeTimeouts.delete(fadeTimeoutId);
        }
        
        if (nodeExists(node)) {
          // Restore original stroke style first (for variables) - ASYNC VERSION
          if (originalStrokeStyleId && 'strokeStyleId' in node) {
            await node.setStrokeStyleIdAsync(originalStrokeStyleId);
          } else if ('strokeStyleId' in node) {
            await node.setStrokeStyleIdAsync('');
          }
          
          // Restore original strokes
          node.strokes = originalStrokes;
          
          // Restore other properties
          if (originalStrokeWeight > 0) {
            node.strokeWeight = originalStrokeWeight;
          } else {
            node.strokeWeight = 0;
          }
          
          node.strokeAlign = originalStrokeAlign;
        }
      } catch (error) {
        console.error('Error cleaning up stroke for node:', nodeId, error);
      }
    })();
    
    restorationPromises.push(restorationPromise);
  });
  
  // Wait for all restorations to complete
  await Promise.all(restorationPromises);
  
  // Clear the tracking map
  framesWithActiveStrokes.clear();
}

// Plugin close handler - SYNCHRONOUS cleanup to prevent interrupted async operations
figma.on('close', () => {
  // Clear all pending timeouts first
  activeStrokeTimeouts.forEach(timeoutId => {
    clearTimeout(timeoutId);
  });
  activeStrokeTimeouts.clear();

  // SYNCHRONOUS stroke restoration - no async operations that can be interrupted
  framesWithActiveStrokes.forEach((data, nodeId) => {
    try {
      const { node, originalStrokes, originalStrokeWeight, originalStrokeAlign } = data;
      
      if (nodeExists(node)) {
        // Restore strokes synchronously (no async style ID operations)
        node.strokes = originalStrokes;
        
        if (originalStrokeWeight > 0) {
          node.strokeWeight = originalStrokeWeight;
        } else {
          node.strokeWeight = 0;
        }
        
        node.strokeAlign = originalStrokeAlign;
        
        // Skip strokeStyleId restoration in close handler since it's async
        // The blue stroke will be gone, which is the main goal
      }
    } catch (error) {
      // Silent fail during shutdown
    }
  });
  
  // Clear the tracking map
  framesWithActiveStrokes.clear();
});

// Store the analyzed frame for optimization
let analyzedFrame: SceneNode | null = null;
let analyzedFrameData: AnalysisResults | null = null;

// Selection change monitoring with immediate frame name update and deferred analysis
figma.on('selectionchange', (): void => {
  const selection = figma.currentPage.selection;
  const hasSelection: boolean = selection.length > 0;
  
  if (hasSelection) {
    // IMMEDIATE: Send frame name update first
    let frameName: string;
    let frameId: string;
    
    if (selection.length === 1) {
      frameName = safeGetNodeName(selection[0]);
      frameId = selection[0].id;
    } else {
      frameName = 'Multiple Frames selected';
      frameId = 'multiple';
    }
    
    // Send immediate frame name update with cleared stats
    figma.ui.postMessage({
      type: 'frame-name-update',
      hasSelection: true,
      frameName: frameName,
      frameId: frameId
    });
    
    // DEFERRED: Perform analysis and send full results
    setTimeout(() => {
      // Check if selection is still the same by comparing length and first item ID
      const currentSelection = figma.currentPage.selection;
      const selectionUnchanged = currentSelection.length === selection.length && 
                                currentSelection.length > 0 && 
                                currentSelection[0].id === selection[0].id;
      
      if (selectionUnchanged) {
        const results: AnalysisResults = analyzeFrames(selection);
        results.frameName = frameName;
        results.frameId = frameId;
        
        // Store for optimization
        analyzedFrame = selection[0];
        analyzedFrameData = results;
        
        figma.ui.postMessage({
          type: 'analysis-result',
          hasSelection: true,
          results: results
        });
      }
    }, 10);
    
  } else {
    // Clear analysis and go back to initial state
    analyzedFrame = null;
    analyzedFrameData = null;
    
    figma.ui.postMessage({
      type: 'selection-changed',
      hasSelection: false,
      results: null
    });
  }
});

// Send initial selection state with improved loading
setTimeout((): void => {
  const selection = figma.currentPage.selection;
  const hasSelection: boolean = selection.length > 0;
  
  if (hasSelection) {
    // Send immediate frame name first
    let frameName: string;
    let frameId: string;
    
    if (selection.length === 1) {
      frameName = safeGetNodeName(selection[0]);
      frameId = selection[0].id;
    } else {
      frameName = 'Multiple Frames selected';
      frameId = 'multiple';
    }
    
    figma.ui.postMessage({
      type: 'frame-name-update',
      hasSelection: true,
      frameName: frameName,
      frameId: frameId
    });
    
    // Then perform analysis
    setTimeout(() => {
      const results: AnalysisResults = analyzeFrames(selection);
      results.frameName = frameName;
      results.frameId = frameId;
      
      analyzedFrame = selection[0];
      analyzedFrameData = results;
      
      figma.ui.postMessage({
        type: 'analysis-result',
        hasSelection: true,
        results: results
      });
    }, 10);
  } else {
    figma.ui.postMessage({
      type: 'selection-changed',
      hasSelection: false,
      results: null
    });
  }
}, 100);

// Message handler
figma.ui.onmessage = (msg: UIMessage): void => {
  console.log('Received message:', msg);
  
  switch (msg.type) {
    case 'optimize':
      optimizeSelection();
      break;
    case 'locate-frame':
      if (msg.nodeId) {
        locateFrame(msg.nodeId);
      }
      break;
    case 'update-settings':
      if (msg.settings) {
        deepOptimizeEnabled = msg.settings.deepOptimize || false;
        console.log('Deep optimize setting updated:', deepOptimizeEnabled);
      }
      break;
    default:
      console.log('Unknown message type:', msg.type);
  }
};

// Locate frame with temporary highlight - COMPLETE FIXED VERSION
async function locateFrame(nodeId: string): Promise<void> {
  try {
    // IMMEDIATE: Clean up any existing strokes first to prevent race conditions
    await cleanupActiveStrokes();
    
    console.log('Attempting to locate frame with ID:', nodeId);
    
    // Try to get the node - this might fail if node is on different page
    let node: BaseNode | null = null;
    
    try {
      node = await figma.getNodeByIdAsync(nodeId);
      console.log('Node found:', node ? node.name : 'null');
    } catch (nodeError) {
      console.error('Failed to get node by ID:', nodeError);
      figma.notify("Frame not found - it may be on a different page");
      return;
    }
    
    if (!node || !nodeExists(node)) {
      console.log('Node is null or does not exist');
      figma.notify("Frame not found or was deleted");
      return;
    }
    
    // Check if node is a SceneNode first
    if (!('type' in node) || !node.type) {
      console.log('Invalid node type');
      figma.notify("Invalid node type");
      return;
    }
    
    const sceneNode = node as SceneNode;
    console.log('Scene node type:', sceneNode.type);
    
    // Only zoom to the frame (don't select it)
    try {
      figma.viewport.scrollAndZoomIntoView([sceneNode]);
      console.log('Successfully scrolled to node');
    } catch (scrollError) {
      console.error('Failed to scroll to node:', scrollError);
      figma.notify("Found frame but couldn't scroll to it");
      return;
    }
    
    // Add temporary blue stroke if it's a frame
    if (isFrameNode(sceneNode)) {
      console.log('Applying blue stroke to frame');
      
      // Store original values with safe symbol handling and variable support
      const originalStrokes = sceneNode.strokes;
      const originalStrokeWeight = isNumberValue(sceneNode.strokeWeight) ? sceneNode.strokeWeight : 0;
      const originalStrokeAlign = sceneNode.strokeAlign;
      
      // Also store stroke style ID for variable-bound strokes
      const originalStrokeStyleId = ('strokeStyleId' in sceneNode && isStringValue(sceneNode.strokeStyleId)) 
        ? sceneNode.strokeStyleId 
        : '';
      
      try {
        // Apply blue highlight stroke
        sceneNode.strokes = [{
          type: 'SOLID',
          color: { r: 0.2, g: 0.4, b: 1 }, // Blue color
          visible: true
        }];
        sceneNode.strokeWeight = 3;
        sceneNode.strokeAlign = 'INSIDE';
        
        // Clear any stroke style to ensure our blue color shows - ASYNC VERSION
        if ('strokeStyleId' in sceneNode) {
          await sceneNode.setStrokeStyleIdAsync('');
        }
        
        console.log('Blue stroke applied successfully');
        
        // IMPROVED: More robust restoration with guaranteed cleanup
        const restoreStroke = async () => {
          console.log('Attempting to restore stroke for node:', nodeId);
          try {
            // Double-check node still exists before restoration
            if (!nodeExists(sceneNode)) {
              console.log('Node no longer exists, skipping restoration');
              framesWithActiveStrokes.delete(nodeId);
              return;
            }
            
            console.log('Restoring original stroke properties');
            
            // Restore original stroke style first (for variables) - ASYNC VERSION
            if (originalStrokeStyleId && 'strokeStyleId' in sceneNode) {
              await sceneNode.setStrokeStyleIdAsync(originalStrokeStyleId);
            } else if ('strokeStyleId' in sceneNode) {
              await sceneNode.setStrokeStyleIdAsync('');
            }
            
            // Restore original strokes
            sceneNode.strokes = originalStrokes;
            
            // Restore other properties
            if (originalStrokeWeight > 0) {
              sceneNode.strokeWeight = originalStrokeWeight;
            } else {
              sceneNode.strokeWeight = 0; // Ensure it's set to 0 if no original stroke
            }
            
            sceneNode.strokeAlign = originalStrokeAlign;
            
            console.log('Stroke restoration completed successfully');
            
            // Remove from tracking
            framesWithActiveStrokes.delete(nodeId);
            
          } catch (restoreError) {
            console.error('Error restoring stroke, forcing cleanup:', restoreError);
            
            // FORCE CLEANUP: If restoration fails, at least remove the blue stroke
            try {
              if (nodeExists(sceneNode)) {
                sceneNode.strokes = []; // Remove all strokes as fallback
                sceneNode.strokeWeight = 0;
                // Try to clear stroke style as fallback - ASYNC VERSION
                if ('strokeStyleId' in sceneNode) {
                  await sceneNode.setStrokeStyleIdAsync('');
                }
              }
            } catch (forceError) {
              console.error('Even force cleanup failed:', forceError);
            }
            
            // Always remove from tracking map
            framesWithActiveStrokes.delete(nodeId);
          }
        };
        
        // Set up single timeout for restoration
        const timeoutId = setTimeout(restoreStroke, 1500);
        activeStrokeTimeouts.add(timeoutId);
        
        // Track for cleanup
        framesWithActiveStrokes.set(nodeId, {
          node: sceneNode,
          originalStrokes,
          originalStrokeWeight,
          originalStrokeAlign,
          originalStrokeStyleId,
          timeoutId
        });
        
        console.log('Stroke cleanup scheduled for 1.5 seconds');
        
      } catch (strokeError) {
        console.error('Failed to apply blue stroke:', strokeError);
        figma.notify("Found frame but couldn't highlight it");
      }
    } else {
      console.log('Node is not a frame, no stroke applied');
      figma.notify("Located node (not a frame)");
    }
    
  } catch (error) {
    console.error('Error in locateFrame:', error);
    figma.notify("Could not locate frame");
  }
}

async function optimizeSelection(): Promise<void> {
  // Reset error collection for new optimization
  cleaningResults.criticalErrors = [];
  cleaningResults.warnings = [];
  
  // Use stored analyzed frame for optimization
  if (analyzedFrame && nodeExists(analyzedFrame)) {
    const framesToRemove = analyzedFrameData?.removableFrames || 0;
    
    try {
      await cleanFrames([analyzedFrame]);
      
      // Calculate actual frames removed
      const totalFramesRemoved = cleaningResults.framesMerged + cleaningResults.siblingsRemoved;
      
      // Show success notification
      if (totalFramesRemoved === 0) {
        figma.notify("Your layers are fully optimized!");
      } else {
        figma.notify(`${totalFramesRemoved} frame${totalFramesRemoved !== 1 ? 's' : ''} removed`);
      }
      
      // Send results to UI with error information
      const optimizationResults: OptimizationResults = {
        totalFrames: analyzedFrameData!.totalFrames - totalFramesRemoved,
        mergeableFrames: analyzedFrameData!.mergeableFrames,
        optimizableSiblingGroups: analyzedFrameData!.optimizableSiblingGroups,
        paddingOptimizations: analyzedFrameData!.paddingOptimizations,
        removableFrames: 0,
        removableFrameInfos: analyzedFrameData!.removableFrameInfos,
        frameName: analyzedFrameData!.frameName,
        frameId: analyzedFrameData!.frameId,
        issues: analyzedFrameData!.issues,
        criticalErrors: cleaningResults.criticalErrors,
        warnings: cleaningResults.warnings,
        framesRemoved: totalFramesRemoved
      };
      
      figma.ui.postMessage({
        type: 'optimization-complete',
        results: optimizationResults
      });
      
    } catch (error) {
      const errorMsg = `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      figma.notify(errorMsg);
      cleaningResults.criticalErrors.push(errorMsg);
      
      // Send error results to UI
      const errorResults: OptimizationResults = {
        totalFrames: analyzedFrameData!.totalFrames,
        mergeableFrames: analyzedFrameData!.mergeableFrames,
        optimizableSiblingGroups: analyzedFrameData!.optimizableSiblingGroups,
        paddingOptimizations: analyzedFrameData!.paddingOptimizations,
        removableFrames: analyzedFrameData!.removableFrames,
        removableFrameInfos: analyzedFrameData!.removableFrameInfos,
        frameName: analyzedFrameData!.frameName,
        frameId: analyzedFrameData!.frameId,
        issues: analyzedFrameData!.issues,
        criticalErrors: cleaningResults.criticalErrors,
        warnings: cleaningResults.warnings,
        framesRemoved: 0
      };
      
      figma.ui.postMessage({
        type: 'optimization-complete',
        results: errorResults
      });
    }
    
    // Clear the stored frame after optimization
    analyzedFrame = null;
    analyzedFrameData = null;
    
    return;
  }
  
  // Fallback to current selection if no analyzed frame is stored
  const selection: readonly SceneNode[] = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify("Please select some frames first");
    return;
  }
  
  try {
    await cleanFrames(selection);
    
    const totalFramesRemoved = cleaningResults.framesMerged + cleaningResults.siblingsRemoved;
    
    if (totalFramesRemoved === 0) {
      figma.notify("Your layers are fully optimized!");
    } else {
      figma.notify(`${totalFramesRemoved} frame${totalFramesRemoved !== 1 ? 's' : ''} removed`);
    }
    
  } catch (error) {
    const errorMsg = `Optimization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    figma.notify(errorMsg);
  }
}

function analyzeFrames(nodes: readonly SceneNode[]): AnalysisResults {
  const results: AnalysisResults = {
    totalFrames: 0,
    mergeableFrames: 0,
    optimizableSiblingGroups: 0,
    paddingOptimizations: 0,
    removableFrames: 0,
    removableFrameInfos: [],
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
        
        // Get the child frame that will actually be removed
        const layoutChildren = getLayoutChildren(node);
        const childFrame = layoutChildren[0];
        
        // Type guard: ensure child is a frame or group
        if (childFrame && isFrameOrGroup(childFrame)) {
          const parentName = safeGetNodeName(node); // The selected parent frame
          const inheritance = calculateInheritanceDetails(childFrame, node);
          
          results.removableFrameInfos.push({
            name: safeGetNodeName(childFrame), // Show child frame name
            nodeId: childFrame.id,             // Use child frame nodeId
            parentName: parentName,            // Parent is the selected frame
            inheritance: inheritance
          });
        }
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
                
                const inheritance = calculateInheritanceDetails(sibling, node);
                
                results.removableFrameInfos.push({
                  name: safeGetNodeName(sibling),
                  nodeId: sibling.id,
                  parentName: safeGetNodeName(node),
                  inheritance: inheritance
                });
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
                
                const inheritance = calculateInheritanceDetails(sibling, node);
                
                results.removableFrameInfos.push({
                  name: safeGetNodeName(sibling),
                  nodeId: sibling.id,
                  parentName: safeGetNodeName(node),
                  inheritance: inheritance
                });
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
  
  // Check for fixed width/sizing unless deep optimize is enabled
  if (!deepOptimizeEnabled && isFrameNode(child) && hasFixedSizing(child)) {
    return false;
  }
  
  // PHASE 1 CRITICAL SAFETY CHECKS
  if (hasTransformOrRotation(parent) || hasComplexFills(parent) || 
      hasComplexStrokes(parent) || hasPrototypeInteractions(parent) || 
      hasAdvancedLayoutModes(parent)) {
    return false;
  }
  
  if (hasTransformOrRotation(child) || hasComplexFills(child) || 
      hasComplexStrokes(child) || hasPrototypeInteractions(child) || 
      hasAdvancedLayoutModes(child)) {
    return false;
  }
  
  if (!fillsAreCompatible(parent, child, sameDimensions)) {
    return false;
  }
  
  if (hasStroke(child) && !sameDimensions) return false;
  if (hasEffects(child) && !sameDimensions) return false;
  if (hasCornerRadius(child) && !sameDimensions) return false;
  if (child.opacity !== 1) return false;
  
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

async function cleanFrames(nodes: readonly SceneNode[]): Promise<void> {
  cleaningResults = {
    framesAnalyzed: 0,
    framesMerged: 0,
    siblingGroupsOptimized: 0,
    siblingsRemoved: 0,
    paddingOptimized: 0,
    issues: [],
    criticalErrors: [],
    warnings: []
  };
  
  async function cleanNode(node: SceneNode): Promise<void> {
    if (!nodeExists(node)) return;
    
    if (node.type === 'COMPONENT') return;
    
    if (isFrameOrGroup(node)) {
      cleaningResults.framesAnalyzed++;
      
      if (hasChildren(node) && nodeExists(node)) {
        try {
          const childrenCopy = [...node.children];
          const existingChildren = childrenCopy.filter(child => nodeExists(child));
          
          // Process children recursively first (depth-first)
          for (const child of existingChildren) {
            if (nodeExists(child)) {
              await cleanNode(child);
            }
          }
        } catch (error) {
          const errorMsg = `Failed to analyze children of "${safeGetNodeName(node)}"`;
          cleaningResults.warnings.push(errorMsg);
        }
      }
      
      // Optimize siblings if this is a frame with auto layout
      if (nodeExists(node) && isFrameNode(node) && hasAutoLayout(node)) {
        try {
          optimizeSiblingsSelectively(node);
        } catch (error) {
          const errorMsg = `Failed to optimize siblings in "${safeGetNodeName(node)}"`;
          cleaningResults.criticalErrors.push(errorMsg);
        }
      }
      
      // Merge frame if possible (do this after processing children and siblings)
      if (nodeExists(node) && canBeMerged(node)) {
        try {
          await mergeFrame(node);
        } catch (error) {
          const errorMsg = `Failed to merge frame "${safeGetNodeName(node)}"`;
          cleaningResults.criticalErrors.push(errorMsg);
        }
      }
    }
  }
  
  for (const node of nodes) {
    try {
      await cleanNode(node);
    } catch (error) {
      const errorMsg = `Failed to process "${safeGetNodeName(node)}"`;
      cleaningResults.criticalErrors.push(errorMsg);
    }
  }
}

async function mergeFrame(parentFrame: FrameNode | GroupNode): Promise<void> {
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
    throw new Error(`Failed to read child frame properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  const alignmentInheritance = determineAlignmentInheritance(parentFrame, childFrame, childSpacingInfo);
  
  const grandchildren: SceneNode[] = [];
  try {
    if (nodeExists(childFrame) && hasChildren(childFrame)) {
      grandchildren.push(...childFrame.children.filter(child => nodeExists(child)));
    }
  } catch (error) {
    throw new Error(`Failed to access grandchildren: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    // Non-critical, continue
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
    // Non-critical, continue
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
    throw new Error(`Failed to apply layout properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      const errorMsg = `Failed to move grandchild "${safeGetNodeName(grandchild)}"`;
      cleaningResults.warnings.push(errorMsg);
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
      const errorMsg = `Failed to restore absolute positioned element "${safeGetNodeName(element)}"`;
      cleaningResults.warnings.push(errorMsg);
    }
  });
  
  try {
    if (nodeExists(childFrame)) {
      childFrame.remove();
    }
  } catch (error) {
    throw new Error(`Failed to remove child frame: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    // Non-critical
  }
  
  try {
    if (nodeExists(parentFrame)) {
      const currentDims = safeGetDimensions(parentFrame);
      if (currentDims.width !== originalWidth || currentDims.height !== originalHeight) {
        parentFrame.resize(originalWidth, originalHeight);
      }
    }
  } catch (error) {
    // Non-critical
  }
  
  if (sameDimensions && nodeExists(parentFrame)) {
    try {
      if (isStringValue(childEffectStyleId) && childEffectStyleId !== '') {
        if (isFrameNode(parentFrame) && 'effectStyleId' in parentFrame) {
          await parentFrame.setEffectStyleIdAsync(childEffectStyleId);
        }
      } else if (childEffects.length > 0) {
        if ('effects' in parentFrame) {
          parentFrame.effects = childEffects;
        }
      }
      
      if (isStringValue(childStrokeStyleId) && childStrokeStyleId !== '') {
        if (isFrameNode(parentFrame) && 'strokeStyleId' in parentFrame) {
          await parentFrame.setStrokeStyleIdAsync(childStrokeStyleId);
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
            await parentFrame.setFillStyleIdAsync(childFillStyleId);
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
          await parentFrame.setFillStyleIdAsync(childFillStyleId);
          if ('fills' in parentFrame) {
            parentFrame.fills = [];
          }
        }
      }
    } catch (error) {
      // Non-critical styling errors, continue
    }
  } else if (nodeExists(parentFrame)) {
    if ((!('fills' in parentFrame) || !parentFrame.fills || !isArrayValue(parentFrame.fills) || parentFrame.fills.length === 0) && 
        (childFills.length > 0 || (isStringValue(childFillStyleId) && childFillStyleId !== ''))) {
      try {
        if (isStringValue(childFillStyleId) && childFillStyleId !== '') {
          if (isFrameNode(parentFrame) && 'fillStyleId' in parentFrame) {
            await parentFrame.setFillStyleIdAsync(childFillStyleId);
          }
        } else if (childFills.length > 0) {
          if ('fills' in parentFrame) {
            parentFrame.fills = childFills;
          }
        }
      } catch (error) {
        // Non-critical styling errors, continue
      }
    }
  }
  
  cleaningResults.framesMerged++;
  cleaningResults.paddingOptimized++;
}