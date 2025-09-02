/// <reference types="@figma/plugin-typings" />

// Frame Cleaner Plugin - Complete TypeScript with Enhanced Selective Sibling Optimization
// Optimizes auto-layout structures by merging unnecessary nested frames and selectively dissolving compatible siblings
// Features: Layout sizing inheritance, selective sibling dissolution with full→partial hierarchy, cross-direction padding validation

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

function isNumberValue(value: number | symbol): value is number {
  return typeof value === 'number';
}

function isStringValue(value: string | symbol): value is string {
  return typeof value === 'string';
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
  
  // Auto gap when SPACE_BETWEEN (regardless of itemSpacing value)
  const hasAutoGap = primaryAlign === 'SPACE_BETWEEN';
  
  if (hasAutoGap) {
    // For SPACE_BETWEEN, itemSpacing shows Figma's current calculated gap
    // This preserves the auto behavior while giving us the current pixel value
    const impliedGapPixels = typeof itemSpacing === 'number' ? itemSpacing : 0;
    
    return {
      hasAutoGap: true,
      itemSpacing: 0, // Not relevant for auto-gap
      impliedGapPixels: impliedGapPixels,
      primaryAxisAlignItems: 'SPACE_BETWEEN'
    };
  }
  
  // Fixed numeric spacing
  if (typeof itemSpacing === 'number') {
    return {
      hasAutoGap: false,
      itemSpacing: itemSpacing,
      impliedGapPixels: itemSpacing,
      primaryAxisAlignItems: primaryAlign
    };
  }
  
  // Handle symbol/mixed values - treat as 0 spacing
  if (typeof itemSpacing === 'symbol') {
    return {
      hasAutoGap: false,
      itemSpacing: 0,
      impliedGapPixels: 0,
      primaryAxisAlignItems: primaryAlign
    };
  }
  
  // Fallback
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
  
  // For SPACE_BETWEEN, Figma already calculates and stores the gap in itemSpacing
  // So we can just read it directly instead of manually calculating
  const currentGap = container.itemSpacing;
  if (typeof currentGap === 'number') {
    return currentGap;
  }
  
  // Fallback: manual calculation if itemSpacing is not available
  const children = getLayoutChildren(container);
  if (children.length < 2) return 0;
  
  try {
    const containerSize = container.layoutMode === 'HORIZONTAL' ? container.width : container.height;
    const childrenTotalSize = children.reduce((sum, child) => {
      if (!nodeExists(child)) return sum;
      const childSize = container.layoutMode === 'HORIZONTAL' ? child.width : child.height;
      return sum + childSize;
    }, 0);
    
    // Account for padding
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
      console.warn(`Error applying sizing inheritance:`, error);
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
  
  // Check for single-child merge
  const layoutChildren = getLayoutChildren(parentFrame);
  const isSingleChildMerge = layoutChildren.length === 1;
  
  if (isSingleChildMerge) {
    console.log(`🎯 SINGLE-CHILD MERGE: Using sizing-aware alignment inheritance`);
    
    // Get sizing modes for both parent and child
    let parentPrimarySizing: string;
    let parentCounterSizing: string;
    let childPrimarySizing: string;
    let childCounterSizing: string;
    
    try {
      if (parentLayoutMode === 'VERTICAL') {
        parentPrimarySizing = parentFrame.primaryAxisSizingMode; // vertical
        parentCounterSizing = parentFrame.counterAxisSizingMode; // horizontal
        childPrimarySizing = childFrame.primaryAxisSizingMode; // vertical
        childCounterSizing = childFrame.counterAxisSizingMode; // horizontal
      } else if (parentLayoutMode === 'HORIZONTAL') {
        parentPrimarySizing = parentFrame.primaryAxisSizingMode; // horizontal
        parentCounterSizing = parentFrame.counterAxisSizingMode; // vertical
        childPrimarySizing = childFrame.primaryAxisSizingMode; // horizontal
        childCounterSizing = childFrame.counterAxisSizingMode; // vertical
      } else {
        return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
      }
    } catch (error) {
      return { inheritPrimaryAxis: false, inheritCounterAxis: false, forceSpaceBetween: false };
    }
    
    console.log(`📊 SIZING-AWARE INHERITANCE ANALYSIS:`);
    console.log(`  Parent layout mode: ${parentLayoutMode}`);
    console.log(`  Parent primary sizing: ${parentPrimarySizing}, counter sizing: ${parentCounterSizing}`);
    console.log(`  Child primary sizing: ${childPrimarySizing}, counter sizing: ${childCounterSizing}`);
    
    // Apply table logic for primary axis
    const inheritPrimaryAxis = shouldInheritAlignment(parentPrimarySizing, childPrimarySizing, 'primary');
    console.log(`  Primary axis inheritance: ${inheritPrimaryAxis ? 'Child' : 'Parent'} (${parentPrimarySizing} parent + ${childPrimarySizing} child)`);
    
    // Apply table logic for counter axis
    const inheritCounterAxis = shouldInheritAlignment(parentCounterSizing, childCounterSizing, 'counter');
    console.log(`  Counter axis inheritance: ${inheritCounterAxis ? 'Child' : 'Parent'} (${parentCounterSizing} parent + ${childCounterSizing} child)`);
    
    // Handle auto-gap special case
    const forceSpaceBetween = childSpacingInfo?.hasAutoGap || false;
    if (forceSpaceBetween) {
      console.log(`  Auto-gap detected: forcing SPACE_BETWEEN for primary axis`);
    }
    
    return { 
      inheritPrimaryAxis, 
      inheritCounterAxis, 
      forceSpaceBetween 
    };
  }
  
  // For multi-child scenarios only: Handle auto-gap
  if (childSpacingInfo?.hasAutoGap) {
    console.log(`🔄 MULTI-CHILD AUTO-GAP: Inheriting primary axis only`);
    return { 
      inheritPrimaryAxis: true, 
      inheritCounterAxis: false, // Only for multi-child scenarios
      forceSpaceBetween: true 
    };
  }
  
  // For multi-child scenarios: If layout mode is changing, inherit ALL alignment properties
  if (parentLayoutMode !== childLayoutMode) {
    console.log(`🔄 Layout mode changing: ${parentLayoutMode} → ${childLayoutMode} - inheriting ALL alignment properties`);
    return { 
      inheritPrimaryAxis: true, 
      inheritCounterAxis: true, 
      forceSpaceBetween: false 
    };
  }
  
  // Layout mode staying same - use existing sizing-based logic (for multi-child scenarios)
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
  
  console.log(`🔄 Multi-child scenario with unchanged layout mode: ${parentLayoutMode} - using sizing-based inheritance (primary: ${inheritPrimaryAxis}, counter: ${inheritCounterAxis})`);
  
  return { inheritPrimaryAxis, inheritCounterAxis, forceSpaceBetween: false };
}

// Helper function to apply the sizing inheritance table logic
function shouldInheritAlignment(parentSizing: string, childSizing: string, axis: string): boolean {
  console.log(`  📋 TABLE LOOKUP for ${axis} axis: Parent(${parentSizing}) + Child(${childSizing})`);
  
  // Apply the inheritance table (expanded to include AUTO):
  // | Parent | Child | Inherit |
  // | FILL   | FILL  | Child   |
  // | FILL   | HUG   | Parent  |
  // | FILL   | AUTO  | Parent  | (AUTO behaves like HUG)
  // | FIXED  | FILL  | Child   |
  // | FIXED  | HUG   | Parent  |
  // | FIXED  | AUTO  | Parent  | (AUTO behaves like HUG)
  // | HUG    | FILL  | Child   |
  // | HUG    | HUG   | Child   |
  // | HUG    | AUTO  | Child   | (AUTO behaves like HUG)
  // | AUTO   | FILL  | Child   | (AUTO behaves like HUG)
  // | AUTO   | HUG   | Child   | (AUTO behaves like HUG)
  // | AUTO   | AUTO  | Child   | (AUTO behaves like HUG)
  
  if (parentSizing === 'FILL') {
    if (childSizing === 'FILL') {
      console.log(`    → Child (FILL child adapts to space usage)`);
      return true; // Child
    } else if (childSizing === 'HUG' || childSizing === 'AUTO') {
      console.log(`    → Parent (Parent FILL context more important than child content flow)`);
      return false; // Parent
    }
  } else if (parentSizing === 'FIXED') {
    if (childSizing === 'FILL') {
      console.log(`    → Child (Child fills fixed container, child alignment determines usage)`);
      return true; // Child
    } else if (childSizing === 'HUG' || childSizing === 'AUTO') {
      console.log(`    → Parent (Parent FIXED alignment represents positioning context)`);
      return false; // Parent
    }
  } else if (parentSizing === 'HUG' || parentSizing === 'AUTO') {
    if (childSizing === 'FILL') {
      console.log(`    → Child (Child fill behavior drives layout)`);
      return true; // Child
    } else if (childSizing === 'HUG' || childSizing === 'AUTO') {
      console.log(`    → Child (Child content-driven alignment drives combined hugging/auto behavior)`);
      return true; // Child
    }
  }
  
  // Fallback to child inheritance for unknown combinations
  console.log(`    → Child (fallback for unknown combination)`);
  return true;
}

// Initialize plugin
figma.showUI(__html__, { width: 350, height: 300 });

let cleaningResults: CleaningResults = {
  framesAnalyzed: 0,
  framesMerged: 0,
  siblingGroupsOptimized: 0,
  siblingsRemoved: 0,
  paddingOptimized: 0,
  issues: []
};

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
  }
};

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

// ===== ENHANCED SELECTIVE SIBLING OPTIMIZATION FUNCTIONS =====

function getCrossDirectionPadding(frame: FrameNode, parentLayoutMode: string): CrossDirectionPadding {
  if (!hasAutoLayout(frame)) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  
  if (parentLayoutMode === 'HORIZONTAL') {
    // Cross direction is vertical, so only top/bottom padding matters
    return { 
      top: frame.paddingTop, 
      bottom: frame.paddingBottom, 
      left: 0, 
      right: 0 
    };
  } else if (parentLayoutMode === 'VERTICAL') {
    // Cross direction is horizontal, so only left/right padding matters  
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
  console.log(`\n🔍 SELECTIVE COMPATIBILITY CHECK: "${safeGetNodeName(sibling)}" in "${safeGetNodeName(parent)}"${requireZeroPadding ? ' (padding:0 required)' : ''}`);
  
  // Must be frame with auto-layout
  if (!hasAutoLayout(sibling)) {
    console.log('❌ Sibling lacks auto-layout');
    return false;
  }
  
  // Must have children
  const layoutChildren = getLayoutChildren(sibling);
  if (layoutChildren.length === 0) {
    console.log('❌ Empty sibling');
    return false;
  }
  
  // V1 LIMITATION: Block dissolution if sibling contains absolute children (complex coordinate math)
  const absoluteChildren = getAbsoluteChildren(sibling);
  if (absoluteChildren.length > 0) {
    console.log(`❌ Sibling contains ${absoluteChildren.length} absolute children - blocked for v1 (complex coordinate transformation)`);
    console.log(`  Absolute children: ${absoluteChildren.map(child => safeGetNodeName(child)).join(', ')}`);
    return false;
  }
  
  // Check padding requirement for partial dissolution
  if (requireZeroPadding && !siblingHasZeroPadding(sibling)) {
    console.log('❌ Sibling has padding (required to be 0 for partial dissolution)');
    return false;
  }
  
  // Layout mode must match parent (with single-child exception)
  const parentLayoutMode = parent.layoutMode;
  const siblingException = layoutChildren.length === 1;
  
  if (!siblingException && sibling.layoutMode !== parentLayoutMode) {
    console.log(`❌ Sibling layoutMode (${sibling.layoutMode}) doesn't match parent (${parentLayoutMode})`);
    return false;
  }
  
  // Check gap compatibility - THIS IS THE KEY MATHEMATICAL CONSTRAINT!
  const siblingSpacing = getChildSpacingInfo(sibling);
  const parentSpacing = getChildSpacingInfo(parent);
  
  console.log(`🔍 GAP COMPATIBILITY CHECK:`);
  console.log(`  Parent gap: ${parentSpacing.impliedGapPixels}px (hasAutoGap: ${parentSpacing.hasAutoGap})`);
  console.log(`  Sibling gap: ${siblingSpacing.impliedGapPixels}px (hasAutoGap: ${siblingSpacing.hasAutoGap})`);
  
  // For auto-gap, both must use auto-gap AND have identical gap values
  if (siblingSpacing.hasAutoGap !== parentSpacing.hasAutoGap) {
    console.log(`❌ Gap type mismatch: Parent auto-gap ${parentSpacing.hasAutoGap} vs Sibling auto-gap ${siblingSpacing.hasAutoGap}`);
    return false;
  }
  
  // Gap values must be identical
  if (Math.abs(siblingSpacing.impliedGapPixels - parentSpacing.impliedGapPixels) > 0.01) {
    console.log(`❌ Gap values don't match: ${siblingSpacing.impliedGapPixels}px vs ${parentSpacing.impliedGapPixels}px`);
    return false;
  }
  
  // ENHANCED VISUAL PROPERTIES CHECKS - STRICT RULES FOR DISSOLUTION
  // Since dissolution completely removes the frame, we must be extremely conservative
  // about ANY visual properties that would be lost
  
  // Check for strokes
  if (hasStroke(sibling)) {
    console.log('❌ Sibling has strokes');
    return false;
  }
  
  // Check for effects
  if (hasEffects(sibling)) {
    console.log('❌ Sibling has effects');
    return false;
  }
  
  // Check for corner radius
  if (hasCornerRadius(sibling)) {
    console.log('❌ Sibling has corner radius');
    return false;
  }
  
  // Check opacity
  if (sibling.opacity !== 1) {
    console.log('❌ Sibling has opacity ≠ 1');
    return false;
  }
  
  // ENHANCED: Check for visible fills that would be lost
  if ('fills' in sibling && isArrayValue(sibling.fills) && sibling.fills.length > 0) {
    const hasVisibleFills = sibling.fills.some(fill => fill.visible !== false);
    if (hasVisibleFills) {
      console.log('❌ Sibling has visible fills that would be lost');
      return false;
    }
  }
  
  // FIXED: Check for blend modes (allow PASS_THROUGH as it's the default for frames)
  if ('blendMode' in sibling && sibling.blendMode !== 'NORMAL' && sibling.blendMode !== 'PASS_THROUGH') {
    console.log(`❌ Sibling has non-standard blend mode: ${sibling.blendMode}`);
    return false;
  }
  
  // ENHANCED: Check for mask/clip content
  if ('clipsContent' in sibling && sibling.clipsContent === true) {
    console.log('❌ Sibling has clipsContent enabled');
    return false;
  }
  
  // ENHANCED: Check for layout grid (visual guide)
  if ('layoutGrids' in sibling && isArrayValue(sibling.layoutGrids) && sibling.layoutGrids.length > 0) {
    const hasVisibleGrids = sibling.layoutGrids.some(grid => grid.visible !== false);
    if (hasVisibleGrids) {
      console.log('❌ Sibling has visible layout grids');
      return false;
    }
  }
  
  // ENHANCED: Check for export settings
  if ('exportSettings' in sibling && isArrayValue(sibling.exportSettings) && sibling.exportSettings.length > 0) {
    console.log('❌ Sibling has export settings');
    return false;
  }
  
  // ENHANCED: Check for component-related properties
  if ('componentPropertyReferences' in sibling && Object.keys(sibling.componentPropertyReferences || {}).length > 0) {
    console.log('❌ Sibling has component property references');
    return false;
  }
  
  // ENHANCED: Check for style references that would be lost
  if ('fillStyleId' in sibling && isStringValue(sibling.fillStyleId) && sibling.fillStyleId !== '') {
    console.log('❌ Sibling has fill style reference');
    return false;
  }
  
  if ('strokeStyleId' in sibling && isStringValue(sibling.strokeStyleId) && sibling.strokeStyleId !== '') {
    console.log('❌ Sibling has stroke style reference');
    return false;
  }
  
  if ('effectStyleId' in sibling && isStringValue(sibling.effectStyleId) && sibling.effectStyleId !== '') {
    console.log('❌ Sibling has effect style reference');
    return false;
  }
  
  // ENHANCED: Check for constraints (important for responsive behavior)
  if ('constraints' in sibling && sibling.constraints) {
    try {
      const constraints = sibling.constraints;
      if (constraints.horizontal !== 'MIN' || constraints.vertical !== 'MIN') {
        console.log(`❌ Sibling has non-default constraints: horizontal=${constraints.horizontal}, vertical=${constraints.vertical}`);
        return false;
      }
    } catch (error) {
      // If constraints checking fails, be conservative and block dissolution
      console.log('❌ Could not verify sibling constraints');
      return false;
    }
  }
  
  // Check fill compatibility with parent (less relevant since we're not merging, but good to verify)
  if (!fillsAreCompatible(parent, sibling, false)) {
    console.log('❌ Incompatible fills with parent');
    return false;
  }
  
  console.log('✅ Sibling is compatible for selective dissolution');
  return true;
}

function canAllSiblingsBeDissolvedTogether(parentFrame: FrameNode): boolean {
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return false;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return false;
  
  console.log(`\n🔍 FULL DISSOLUTION CHECK: Checking if ALL ${siblingFrames.length} siblings can be dissolved together in "${safeGetNodeName(parentFrame)}"`);
  
  // CRITICAL: For full dissolution, ALL siblings must have zero padding
  for (const sibling of siblingFrames) {
    if (!nodeExists(sibling)) {
      console.log(`❌ Sibling no longer exists`);
      return false;
    }
    
    if (!siblingHasZeroPadding(sibling)) {
      console.log(`❌ Full dissolution blocked: sibling "${safeGetNodeName(sibling)}" has padding (full dissolution requires ALL siblings to have zero padding)`);
      return false;
    }
  }
  
  // Every sibling must also be compatible (gap matching, visual properties, etc.)
  for (const sibling of siblingFrames) {
    if (!canSiblingBeDissolvedSelectively(sibling, parentFrame, false)) {
      console.log(`❌ Full dissolution blocked by incompatible sibling: "${safeGetNodeName(sibling)}"`);
      return false;
    }
  }
  
  console.log(`✅ ALL siblings have zero padding AND are compatible for full dissolution`);
  return true;
}

function dissolveAllSiblings(parentFrame: FrameNode): void {
  console.log(`\n🚀 FULL SIBLING DISSOLUTION: Dissolving ALL siblings in "${safeGetNodeName(parentFrame)}"`);
  
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return;
  
  let totalChildrenPromoted = 0;
  let paddingTransferred = false;
  
  // Process siblings in reverse order to avoid index shifting
  for (let i = siblingFrames.length - 1; i >= 0; i--) {
    const sibling = siblingFrames[i];
    
    if (!nodeExists(sibling)) continue;
    
    console.log(`📦 Dissolving sibling ${i + 1}/${siblingFrames.length}: "${safeGetNodeName(sibling)}"`);
    
    try {
      // Get sibling's position among current parent children (this changes as we remove siblings)
      const currentParentChildren = getLayoutChildren(parentFrame);
      const siblingIndex = currentParentChildren.findIndex(child => child === sibling);
      
      if (siblingIndex === -1) {
        console.log(`❌ Could not find sibling position`);
        continue;
      }
      
      // Transfer cross-direction padding only from the first sibling
      if (!paddingTransferred && hasAutoLayout(sibling)) {
        const parentLayoutMode = parentFrame.layoutMode;
        const siblingPadding = getCrossDirectionPadding(sibling, parentLayoutMode);
        
        if (siblingPadding.top > 0 || siblingPadding.bottom > 0 || siblingPadding.left > 0 || siblingPadding.right > 0) {
          console.log(`🔧 Transferring cross-direction padding from first sibling to parent`);
          console.log(`  Padding: top:${siblingPadding.top}, bottom:${siblingPadding.bottom}, left:${siblingPadding.left}, right:${siblingPadding.right}`);
          
          parentFrame.paddingLeft += siblingPadding.left;
          parentFrame.paddingRight += siblingPadding.right;
          parentFrame.paddingTop += siblingPadding.top;
          parentFrame.paddingBottom += siblingPadding.bottom;
          
          paddingTransferred = true;
        }
      }
      
      // Collect and move sibling's children
      if (hasChildren(sibling)) {
        const childrenToMove = [...sibling.children].filter(child => nodeExists(child));
        console.log(`  📦 Moving ${childrenToMove.length} children from sibling to parent`);
        
        // Insert children in reverse order to maintain positioning
        for (let j = childrenToMove.length - 1; j >= 0; j--) {
          const child = childrenToMove[j];
          if (nodeExists(child) && nodeExists(parentFrame)) {
            parentFrame.insertChild(siblingIndex, child);
            totalChildrenPromoted++;
          }
        }
      }
      
      // Remove the empty sibling
      if (nodeExists(sibling)) {
        sibling.remove();
        cleaningResults.siblingsRemoved++;
      }
      
    } catch (error) {
      console.warn(`Error dissolving sibling "${safeGetNodeName(sibling)}":`, error);
    }
  }
  
  console.log(`✅ Full dissolution complete: ${siblingFrames.length} siblings dissolved, ${totalChildrenPromoted} children promoted`);
  cleaningResults.siblingGroupsOptimized++;
}

function dissolveSingleSibling(sibling: FrameNode, parent: FrameNode, shouldTransferPadding: boolean = true): void {
  console.log(`\n🚀 DISSOLVING SINGLE SIBLING: "${safeGetNodeName(sibling)}" → promoting children to "${safeGetNodeName(parent)}"`);
  
  if (!nodeExists(sibling) || !nodeExists(parent)) {
    console.log('❌ Sibling or parent no longer exists');
    return;
  }
  
  // Get sibling's position among parent's children
  const parentChildren = getLayoutChildren(parent);
  const siblingIndex = parentChildren.findIndex(child => child === sibling);
  
  if (siblingIndex === -1) {
    console.log('❌ Could not find sibling position in parent');
    return;
  }
  
  console.log(`📍 Sibling position: ${siblingIndex} of ${parentChildren.length}`);
  
  // Transfer cross-direction padding only if this is the first dissolution in the group
  if (shouldTransferPadding && hasAutoLayout(sibling)) {
    const parentLayoutMode = parent.layoutMode;
    const siblingPadding = getCrossDirectionPadding(sibling, parentLayoutMode);
    
    if (siblingPadding.top > 0 || siblingPadding.bottom > 0 || siblingPadding.left > 0 || siblingPadding.right > 0) {
      console.log(`🔧 Transferring sibling cross-direction padding to parent (first dissolution only)`);
      console.log(`  Sibling padding: top:${siblingPadding.top}, bottom:${siblingPadding.bottom}, left:${siblingPadding.left}, right:${siblingPadding.right}`);
      
      parent.paddingLeft += siblingPadding.left;
      parent.paddingRight += siblingPadding.right;
      parent.paddingTop += siblingPadding.top;
      parent.paddingBottom += siblingPadding.bottom;
      
      console.log(`  New parent padding: ${parent.paddingTop}, ${parent.paddingRight}, ${parent.paddingBottom}, ${parent.paddingLeft}`);
    }
  } else if (!shouldTransferPadding) {
    console.log(`ℹ️ Skipping padding transfer (already transferred for this group)`);
  }
  
  // Collect sibling's children and explicitly move them BEFORE removing sibling
  const siblingChildren: SceneNode[] = [];
  
  if (hasChildren(sibling)) {
    const children = [...sibling.children].filter(child => nodeExists(child));
    console.log(`📦 Found ${children.length} children to promote`);
    
    // Insert children in reverse order to maintain correct positioning
    // This prevents index shifting from affecting the order
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const childName = safeGetNodeName(child);
      console.log(`  📦 Moving child ${i}: "${childName}" to position ${siblingIndex}`);
      siblingChildren.unshift(child); // Add to front to maintain original order
      
      try {
        // Insert all children at the same position (sibling's position)
        // Later insertions push earlier ones forward, maintaining order
        if (nodeExists(child) && nodeExists(parent)) {
          parent.insertChild(siblingIndex, child);
        }
      } catch (error) {
        console.warn(`Error moving child ${i}:`, error);
      }
    }
  }
  
  // Now remove the empty sibling
  try {
    console.log(`🗑️ Removing empty sibling: "${safeGetNodeName(sibling)}"`);
    sibling.remove();
    cleaningResults.siblingsRemoved++;
  } catch (error) {
    console.warn(`Error removing sibling:`, error);
    return;
  }
  
  console.log(`✅ Selective sibling dissolution complete: ${siblingChildren.length} children promoted`);
}

function optimizeSiblingsSelectively(parentFrame: FrameNode): void {
  if (!nodeExists(parentFrame) || !hasAutoLayout(parentFrame)) return;
  
  const layoutChildren = getLayoutChildren(parentFrame);
  const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
  
  if (siblingFrames.length === 0) return;
  
  console.log(`\n🔄 ENHANCED SIBLING OPTIMIZATION: Checking ${siblingFrames.length} frame siblings in "${safeGetNodeName(parentFrame)}"`);
  
  // Fix SCALE constraints on absolute positioned siblings
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
  
  // STRATEGY 1: Try full dissolution first
  if (canAllSiblingsBeDissolvedTogether(parentFrame)) {
    console.log(`🎯 FULL DISSOLUTION: All siblings compatible - dissolving together`);
    dissolveAllSiblings(parentFrame);
    return;
  }
  
  console.log(`ℹ️ Full dissolution not possible - checking partial dissolution (padding:0 only)`);
  
  // STRATEGY 2: Partial dissolution with padding:0 requirement
  let dissolvedCount = 0;
  let paddingTransferred = false;
  
  // Check each sibling individually for dissolution potential (padding:0 required)
  // Process in reverse order to avoid index shifting issues
  for (let i = siblingFrames.length - 1; i >= 0; i--) {
    const sibling = siblingFrames[i];
    
    if (!nodeExists(sibling)) continue;
    
    // Require zero padding for partial dissolution
    if (canSiblingBeDissolvedSelectively(sibling, parentFrame, true)) {
      console.log(`🎯 Sibling "${safeGetNodeName(sibling)}" is compatible for partial dissolution (padding:0)`);
      
      try {
        dissolveSingleSibling(sibling, parentFrame, !paddingTransferred);
        dissolvedCount++;
        paddingTransferred = true; // Only transfer padding once per optimization round
      } catch (error) {
        console.warn(`Error dissolving sibling "${safeGetNodeName(sibling)}":`, error);
      }
    } else {
      console.log(`ℹ️ Sibling "${safeGetNodeName(sibling)}" not compatible for partial dissolution - keeping as-is`);
    }
  }
  
  if (dissolvedCount > 0) {
    console.log(`✅ Partial optimization complete: ${dissolvedCount} siblings dissolved in "${safeGetNodeName(parentFrame)}"`);
    cleaningResults.siblingGroupsOptimized++;
  } else {
    console.log(`ℹ️ No siblings were compatible for dissolution in "${safeGetNodeName(parentFrame)}"`);
  }
}

// ===== END ENHANCED SELECTIVE SIBLING OPTIMIZATION =====

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
  
  const results: AnalysisResults = analyzeFrames(selection);
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
    issues: []
  };
  
  function analyzeNode(node: SceneNode): void {
    if (isFrameOrGroup(node)) {
      results.totalFrames++;
      
      if (canBeMerged(node)) {
        results.mergeableFrames++;
      }
      
      // Check for optimizable siblings (enhanced approach: full vs partial)
      if (isFrameNode(node) && hasAutoLayout(node)) {
        const layoutChildren = getLayoutChildren(node);
        const siblingFrames = layoutChildren.filter(child => isFrameNode(child)) as FrameNode[];
        
        // Check for full dissolution potential
        if (canAllSiblingsBeDissolvedTogether(node)) {
          results.optimizableSiblingGroups++;
        } else {
          // Check for partial dissolution potential (padding:0 only)
          let hasPartialOptimization = false;
          siblingFrames.forEach(sibling => {
            if (canSiblingBeDissolvedSelectively(sibling, node, true)) {
              hasPartialOptimization = true;
            }
          });
          
          if (hasPartialOptimization) {
            results.optimizableSiblingGroups++;
          }
        }
      }
      
      if (hasPaddingOptimization(node)) {
        results.paddingOptimizations++;
      }
      
      const issues = checkForIssues(node);
      results.issues.push(...issues);
      
      if (hasChildren(node)) {
        node.children.forEach(child => analyzeNode(child));
      }
    }
  }
  
  nodes.forEach(node => analyzeNode(node));
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
      
      // First, recursively clean children (depth-first)
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
          console.warn(`Error processing children:`, error);
        }
      }
      
      // Then optimize siblings selectively (after children are cleaned)
      if (nodeExists(node) && isFrameNode(node) && hasAutoLayout(node)) {
        try {
          optimizeSiblingsSelectively(node);
        } catch (error) {
          console.warn('Error optimizing siblings selectively:', error);
        }
      }
      
      // Finally, try to merge this frame (single-child optimization)
      if (nodeExists(node) && canBeMerged(node)) {
        try {
          mergeFrame(node);
        } catch (error) {
          console.warn(`Error merging frame:`, error);
        }
      }
    }
  }
  
  nodes.forEach(node => cleanNode(node));
  
  figma.ui.postMessage({
    type: 'cleaning-result',
    results: cleaningResults
  });
  
  const totalOptimized = cleaningResults.framesMerged + cleaningResults.siblingGroupsOptimized;
  figma.notify(`Optimized ${totalOptimized} structures (${cleaningResults.framesMerged} merged, ${cleaningResults.siblingGroupsOptimized} sibling groups optimized, ${cleaningResults.siblingsRemoved} frames removed)`);
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
  
  if (isGroupNode(parent) || isGroupNode(child)) return false;
  
  if (!hasAutoLayout(parent) || !hasAutoLayout(child)) return false;
  
  // PHASE 3: Child FIXED Sizing Handling
  // Block child FIXED sizing when there are conflicts
  if (isFrameNode(child) && hasAutoLayout(child)) {
    const childHasFixedSizing = child.layoutSizingHorizontal === 'FIXED' || child.layoutSizingVertical === 'FIXED';
    
    if (childHasFixedSizing) {
      console.log(`🔍 CHILD FIXED SIZING CHECK: "${safeGetNodeName(child)}" has FIXED sizing`);
      console.log(`  Child horizontal sizing: ${child.layoutSizingHorizontal}`);
      console.log(`  Child vertical sizing: ${child.layoutSizingVertical}`);
      
      // Check dimension compatibility
      const dimensionsCompatible = sameDimensions;
      console.log(`  Dimensions compatible: ${dimensionsCompatible} (${parent.width}x${parent.height} vs ${child.width}x${child.height})`);
      
      // Check alignment compatibility
      const alignmentCompatible = (
        parent.primaryAxisAlignItems === child.primaryAxisAlignItems &&
        parent.counterAxisAlignItems === child.counterAxisAlignItems
      );
      console.log(`  Alignment compatible: ${alignmentCompatible}`);
      console.log(`    Parent: primary=${parent.primaryAxisAlignItems}, counter=${parent.counterAxisAlignItems}`);
      console.log(`    Child: primary=${child.primaryAxisAlignItems}, counter=${child.counterAxisAlignItems}`);
      
      // Allow merge if either dimensions OR alignment are compatible
      if (!dimensionsCompatible && !alignmentCompatible) {
        console.log(`❌ BLOCKING MERGE: Child has FIXED sizing with incompatible dimensions AND alignment`);
        return false;
      } else if (dimensionsCompatible) {
        console.log(`✅ ALLOWING MERGE: Compatible dimensions override FIXED sizing conflict`);
      } else if (alignmentCompatible) {
        console.log(`✅ ALLOWING MERGE: Compatible alignment override FIXED sizing conflict`);
      }
    }
  }
  
  if (!fillsAreCompatible(parent, child, sameDimensions)) return false;
  
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
  
  // Store parent's original padding before it gets modified
  const originalParentPadding = {
    left: parentFrame.paddingLeft,
    right: parentFrame.paddingRight,
    top: parentFrame.paddingTop,
    bottom: parentFrame.paddingBottom
  };
  
  const combinedPadding: CombinedPadding = calculateCombinedPadding(parentFrame, childFrame);
  
  // Store child's layout properties
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
      
      // DEBUG: Log child's current alignment properties
      console.log(`📋 CHILD ALIGNMENT PROPERTIES: "${safeGetNodeName(childFrame)}"`);
      console.log(`  Layout mode: ${childLayoutMode}`);
      console.log(`  Primary align: ${childSpacingInfo.primaryAxisAlignItems}`);
      console.log(`  Counter align: ${childCounterAxisAlignItems}`);
      console.log(`  Primary sizing: ${childPrimaryAxisSizingMode}`);
      console.log(`  Counter sizing: ${childCounterAxisSizingMode}`);
      console.log(`  Item spacing: ${childSpacingInfo.itemSpacing}`);
      console.log(`  Has auto gap: ${childSpacingInfo.hasAutoGap}`);
    }
  } catch (error) {
    return;
  }
  
  const alignmentInheritance = determineAlignmentInheritance(parentFrame, childFrame, childSpacingInfo);
  
  // DEBUG: Log parent's original alignment properties
  console.log(`📋 PARENT ALIGNMENT PROPERTIES (BEFORE): "${safeGetNodeName(parentFrame)}"`);
  console.log(`  Layout mode: ${parentFrame.layoutMode}`);
  console.log(`  Primary align: ${parentFrame.primaryAxisAlignItems}`);
  console.log(`  Counter align: ${parentFrame.counterAxisAlignItems}`);
  console.log(`  Primary sizing: ${parentFrame.primaryAxisSizingMode}`);
  console.log(`  Counter sizing: ${parentFrame.counterAxisSizingMode}`);
  console.log(`  Item spacing: ${parentFrame.itemSpacing}`);
  
  // DEBUG: Log inheritance decision
  console.log(`🔄 INHERITANCE DECISION:`);
  console.log(`  Inherit primary axis: ${alignmentInheritance.inheritPrimaryAxis}`);
  console.log(`  Inherit counter axis: ${alignmentInheritance.inheritCounterAxis}`);
  console.log(`  Force space between: ${alignmentInheritance.forceSpaceBetween}`);
  
  // Store grandchildren
  const grandchildren: SceneNode[] = [];
  try {
    if (nodeExists(childFrame) && hasChildren(childFrame)) {
      grandchildren.push(...childFrame.children.filter(child => nodeExists(child)));
    }
  } catch (error) {
    console.warn('Error accessing grandchildren:', error);
  }
  
  // Store visual properties for transfer
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
    console.warn('Error storing visual properties:', error);
  }
  
  // Store absolute elements AND fix SCALE constraints immediately BEFORE any layout changes
  let childAbsoluteElements: SceneNode[] = [];
  let parentAbsoluteElements: SceneNode[] = [];
  let originalAbsoluteStates: Array<{element: SceneNode, x: number, y: number, width: number, height: number}> = [];
  
  try {
    if (nodeExists(childFrame)) {
      childAbsoluteElements = getAbsoluteChildren(childFrame);
      
      // PREEMPTIVE CONSTRAINT FIXING: Fix SCALE constraints BEFORE any layout changes
      childAbsoluteElements.forEach(element => {
        if ('constraints' in element && element.constraints) {
          const constraints = element.constraints;
          const hasScaleConstraints = constraints.horizontal === 'SCALE' || constraints.vertical === 'SCALE';
          
          if (hasScaleConstraints) {
            element.constraints = {horizontal: 'MIN', vertical: 'MIN'};
          }
        }
      });
      
      // Capture original state AFTER fixing constraints but BEFORE layout changes
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
    console.warn('Error accessing absolute elements:', error);
  }
  
  try {
    // Apply layout properties BEFORE moving children
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
        console.log(`🔄 Applied primary alignment: ${newPrimaryAlign}`);
      }

      if (alignmentInheritance.inheritCounterAxis) {
        parentFrame.counterAxisAlignItems = childCounterAxisAlignItems;
        console.log(`🔄 Applied counter alignment: ${childCounterAxisAlignItems}`);
      }
      
      parentFrame.primaryAxisSizingMode = childPrimaryAxisSizingMode;
      parentFrame.counterAxisSizingMode = childCounterAxisSizingMode;
      
      // DEBUG: Log parent's final alignment properties
      console.log(`📋 PARENT ALIGNMENT PROPERTIES (AFTER): "${safeGetNodeName(parentFrame)}"`);
      console.log(`  Layout mode: ${parentFrame.layoutMode}`);
      console.log(`  Primary align: ${parentFrame.primaryAxisAlignItems}`);
      console.log(`  Counter align: ${parentFrame.counterAxisAlignItems}`);
      console.log(`  Primary sizing: ${parentFrame.primaryAxisSizingMode}`);
      console.log(`  Counter sizing: ${parentFrame.counterAxisSizingMode}`);
      console.log(`  Item spacing: ${parentFrame.itemSpacing}`);
    }
    else if (nodeExists(parentFrame)) {
      parentFrame.paddingLeft = combinedPadding.left;
      parentFrame.paddingRight = combinedPadding.right;
      parentFrame.paddingTop = combinedPadding.top;
      parentFrame.paddingBottom = combinedPadding.bottom;
    }
  } catch (error) {
    console.warn('Error applying layout properties:', error);
    return;
  }
  
  // Apply layout sizing inheritance BEFORE moving children
  if (isFrameNode(childFrame) && nodeExists(childFrame)) {
    applyLayoutSizingInheritance(parentFrame, childFrame, grandchildren);
  }
  
  // Move all grandchildren to parent
  grandchildren.forEach((grandchild: SceneNode): void => {
    if (!nodeExists(grandchild)) return;
    
    try {
      if (nodeExists(parentFrame) && nodeExists(grandchild)) {
        parentFrame.appendChild(grandchild);
      }
    } catch (error) {
      console.warn(`Error moving grandchild:`, error);
    }
  });
  
  // FIXED: Move child's absolute elements to parent with coordinate transformation using original states
  originalAbsoluteStates.forEach((originalState): void => {
    const element = originalState.element;
    if (!nodeExists(element) || !('x' in element) || !('y' in element)) return;
    
    try {
      if (nodeExists(parentFrame)) {
        // COMPREHENSIVE LOGGING: Show original captured state vs current state
        console.log(`📊 ABSOLUTE CHILD ORIGINAL CAPTURED STATE: "${safeGetNodeName(element)}"`);
        console.log(`  Captured position: (${originalState.x}, ${originalState.y})`);
        console.log(`  Captured dimensions: ${originalState.width} x ${originalState.height}`);
        console.log(`  Current position: (${element.x}, ${element.y})`);
        console.log(`  Current dimensions: ${element.width} x ${element.height}`);
        console.log(`  Layout positioning: ${'layoutPositioning' in element ? element.layoutPositioning : 'N/A'}`);
        console.log(`  Constraints: ${'constraints' in element ? JSON.stringify(element.constraints) : 'N/A'}`);
        console.log(`🔧 Parent original padding: left=${originalParentPadding.left}, top=${originalParentPadding.top}`);
        
        // Calculate new coordinates using ORIGINAL captured position
        const newX = originalState.x + originalParentPadding.left;
        const newY = originalState.y + originalParentPadding.top;
        
        console.log(`🧮 COORDINATE CALCULATION (using original captured state):`);
        console.log(`  Original captured: (${originalState.x}, ${originalState.y})`);
        console.log(`  Padding offset: (+${originalParentPadding.left}, +${originalParentPadding.top})`);
        console.log(`  Calculated new: (${newX}, ${newY})`);
        
        // Fix constraints first to prevent scaling issues
        if ('constraints' in element && element.constraints) {
          const oldConstraints = JSON.stringify(element.constraints);
          element.constraints = {horizontal: 'MIN', vertical: 'MIN'};
          console.log(`🔧 Fixed constraints: ${oldConstraints} → {"horizontal":"MIN","vertical":"MIN"}`);
        }
        
        // Restore original dimensions if element supports resizing
        if ('resize' in element && typeof element.resize === 'function') {
          console.log(`🔄 Step 1: Restoring original dimensions from ${element.width}x${element.height} to ${originalState.width}x${originalState.height}`);
          element.resize(originalState.width, originalState.height);
        } else {
          console.log(`ℹ️ Element type ${safeGetNodeType(element)} doesn't support resize - dimensions may remain affected`);
        }
        
        // Apply coordinate transform using original captured position
        console.log(`🔄 Step 2: Updating coordinates using original captured state...`);
        element.x = newX;
        element.y = newY;
        
        // Check state after coordinate update
        console.log(`📍 After restore and coordinate update:`);
        console.log(`  Position: (${element.x}, ${element.y})`);
        console.log(`  Dimensions: ${element.width} x ${element.height}`);
        console.log(`  Layout positioning: ${'layoutPositioning' in element ? element.layoutPositioning : 'N/A'}`);
        
        // Then move to parent
        console.log(`🔄 Step 2: Moving to new parent "${safeGetNodeName(parentFrame)}"...`);
        parentFrame.appendChild(element);
        
        // COMPREHENSIVE FINAL STATE CHECK
        const finalState = {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          layoutPositioning: 'layoutPositioning' in element ? element.layoutPositioning : 'N/A',
          constraints: 'constraints' in element ? JSON.stringify(element.constraints) : 'N/A',
          parent: element.parent ? safeGetNodeName(element.parent) : 'N/A'
        };
        
        console.log(`📊 ABSOLUTE CHILD FINAL STATE: "${safeGetNodeName(element)}"`);
        console.log(`  Position: (${finalState.x}, ${finalState.y})`);
        console.log(`  Dimensions: ${finalState.width} x ${finalState.height}`);
        console.log(`  Layout positioning: ${finalState.layoutPositioning}`);
        console.log(`  Constraints: ${finalState.constraints}`);
        console.log(`  New parent: ${finalState.parent}`);
        
        // ANALYSIS: Compare against expected values
        const positionCorrect = Math.abs(finalState.x - newX) < 0.01 && Math.abs(finalState.y - newY) < 0.01;
        const dimensionsCorrect = Math.abs(finalState.width - originalState.width) < 0.01 && Math.abs(finalState.height - originalState.height) < 0.01;
        
        console.log(`🔍 CORRECTNESS ANALYSIS:`);
        console.log(`  Position correct: ${positionCorrect ? '✅ YES' : '❌ NO'}`);
        console.log(`  Dimensions correct: ${dimensionsCorrect ? '✅ YES' : '❌ NO'}`);
        
        if (!positionCorrect) {
          console.log(`❌ POSITION ERROR: Expected (${newX}, ${newY}), got (${finalState.x}, ${finalState.y})`);
        }
        
        if (!dimensionsCorrect) {
          console.log(`❌ DIMENSION ERROR: Expected ${originalState.width}x${originalState.height}, got ${finalState.width}x${finalState.height}`);
        }
        
        if (positionCorrect && dimensionsCorrect) {
          console.log(`✅ ABSOLUTE CHILD PERFECT: Position and dimensions exactly as expected`);
        }
      }
    } catch (error) {
      console.warn(`Error moving absolute child:`, error);
    }
  });
  
  // Remove the empty child frame
  try {
    if (nodeExists(childFrame)) {
      childFrame.remove();
    }
  } catch (error) {
    console.warn('Error removing child frame:', error);
  }
  
  // Restore layer order for parent's existing absolute elements
  try {
    if (nodeExists(parentFrame)) {
      parentAbsoluteElements.forEach((element: SceneNode): void => {
        if (nodeExists(element) && nodeExists(parentFrame)) {
          parentFrame.appendChild(element);
        }
      });
    }
  } catch (error) {
    console.warn('Error restoring absolute elements:', error);
  }
  
  // Restore original dimensions
  try {
    if (nodeExists(parentFrame)) {
      const currentDims = safeGetDimensions(parentFrame);
      if (currentDims.width !== originalWidth || currentDims.height !== originalHeight) {
        parentFrame.resize(originalWidth, originalHeight);
      }
    }
  } catch (error) {
    console.warn('Error restoring dimensions:', error);
  }
  
  // Transfer visual properties if dimensions matched
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
      console.warn('Error transferring visual properties:', error);
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
        console.warn('Error applying fills:', error);
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