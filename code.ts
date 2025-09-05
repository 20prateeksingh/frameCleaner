/// <reference types="@figma/plugin-typings" />

// Frame Cleaner Plugin - Tranche 1: Constraint Refactoring & Safety Fixes
// Features: Real-time analysis on selection change, inheritance details, multi-frame support

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

// TRANCHE 3: Enhanced fill and style ID helper functions

// Get resolved color from a fill, accounting for styleIDs
function getResolvedFillColor(fill: Paint): { r: number; g: number; b: number } | null {
  try {
    if (fill.type === 'SOLID' && fill.visible !== false) {
      return fill.color;
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Get all resolved colors from a node's fills
function getResolvedFillColors(node: FrameNode | GroupNode): Array<{ r: number; g: number; b: number }> {
  const colors: Array<{ r: number; g: number; b: number }> = [];
  
  try {
    if (!('fills' in node) || !isArrayValue(node.fills)) return colors;
    
    for (const fill of node.fills) {
      const color = getResolvedFillColor(fill);
      if (color) {
        colors.push(color);
      }
    }
  } catch (error) {
    // Silent fail
  }
  
  return colors;
}

// Check if two colors match (with small tolerance for floating point)
function colorsMatch(color1: { r: number; g: number; b: number }, color2: { r: number; g: number; b: number }): boolean {
  const tolerance = 0.001;
  return Math.abs(color1.r - color2.r) < tolerance &&
         Math.abs(color1.g - color2.g) < tolerance &&
         Math.abs(color1.b - color2.b) < tolerance;
}

// Check if arrays of colors match
function colorArraysMatch(colors1: Array<{ r: number; g: number; b: number }>, colors2: Array<{ r: number; g: number; b: number }>): boolean {
  if (colors1.length !== colors2.length) return false;
  
  for (let i = 0; i < colors1.length; i++) {
    if (!colorsMatch(colors1[i], colors2[i])) {
      return false;
    }
  }
  
  return true;
}

// TRANCHE 3: Additional helper functions for style ID resolution
function getStyleResolvedColor(styleId: string): { r: number; g: number; b: number } | null {
  try {
    const style = figma.getStyleById(styleId);
    if (style && style.type === 'PAINT' && style.paints && style.paints.length > 0) {
      const paint = style.paints[0];
      if (paint.type === 'SOLID') {
        return paint.color;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

function getDirectFillColor(fill: Paint): { r: number; g: number; b: number } | null {
  try {
    if (fill.type === 'SOLID' && fill.visible !== false) {
      return fill.color;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function getDirectFillColors(node: FrameNode | GroupNode): Array<{ r: number; g: number; b: number }> {
  const colors: Array<{ r: number; g: number; b: number }> = [];
  
  try {
    if (!('fills' in node) || !isArrayValue(node.fills)) return colors;
    
    for (const fill of node.fills) {
      const color = getDirectFillColor(fill);
      if (color) {
        colors.push(color);
      }
    }
  } catch (error) {
    // Silent fail
  }
  
  return colors;
}

function styleColorMatchesNodeColors(styleId: string, node: FrameNode | GroupNode): boolean {
  try {
    const styleColor = getStyleResolvedColor(styleId);
    if (!styleColor) return false;
    
    const nodeColors = getDirectFillColors(node);
    if (nodeColors.length !== 1) return false; // Only support single color comparison for now
    
    return colorsMatch(styleColor, nodeColors[0]);
  } catch (error) {
    return false;
  }
}

// TRANCHE 1: REFACTORED CONSTRAINT FUNCTIONS

// High-risk safety constraints (apply to operations that could break functionality)
function hasHighRiskSafetyIssues(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node)) return true;
    
    // Transforms/Rotation
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
    
    // Prototype interactions
    if ('reactions' in node && isArrayValue(node.reactions) && node.reactions.length > 0) {
      return true;
    }
    
    if ('flowStartingPoints' in node && Array.isArray(node.flowStartingPoints) && node.flowStartingPoints.length > 0) {
      return true;
    }
    
    // Advanced layout modes
    if (isFrameNode(node)) {
      if ('layoutWrap' in node && node.layoutWrap === 'WRAP') {
        return true;
      }
      
      if (hasAutoLayout(node) && node.counterAxisAlignItems === 'BASELINE') {
        return true;
      }
      
      if (node.layoutMode === 'GRID') {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

// Visual property issues (apply to nodes being dissolved)
function hasVisualPropertyIssues(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node)) return true;
    
    // Complex fills
    if ('fills' in node) {
      const fills = node.fills;
      if (isArrayValue(fills) && fills.length > 0) {
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
      }
    }
    
    // Complex strokes
    if ('strokes' in node) {
      const strokes = node.strokes;
      if (isArrayValue(strokes) && strokes.length > 0) {
        for (const stroke of strokes) {
          if (!stroke.visible) continue;
          
          if (stroke.type !== 'SOLID') {
            return true;
          }
        }
      }
    }
    
    // Clips content
    if ('clipsContent' in node && node.clipsContent === true) {
      return true;
    }
    
    // Layout grids
    if ('layoutGrids' in node && isArrayValue(node.layoutGrids) && node.layoutGrids.length > 0) {
      const hasVisibleGrids = node.layoutGrids.some(grid => grid.visible !== false);
      if (hasVisibleGrids) {
        return true;
      }
    }
    
    // Component property references
    if ('componentPropertyReferences' in node && Object.keys(node.componentPropertyReferences || {}).length > 0) {
      return true;
    }
    
    // Blend mode
    if ('blendMode' in node && node.blendMode !== 'NORMAL' && node.blendMode !== 'PASS_THROUGH') {
      return true;
    }
    
    // Opacity
    if (node.opacity !== 1) {
      return true;
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

// Component safety check
function hasComponentIssues(node: SceneNode): boolean {
  try {
    if (!nodeExists(node)) return true;
    
    // Explicit component type checking
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      return true;
    }
    
    // Instance nodes might also need special handling
    if (node.type === 'INSTANCE') {
      return true;
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

// Dimensional constraint issues
function hasDimensionalIssues(node: FrameNode | GroupNode, requireExactDimensions: boolean): boolean {
  try {
    if (!nodeExists(node)) return true;
    
    if (!requireExactDimensions) {
      return false; // No dimensional constraints if dimensions match
    }
    
    // Check for strokes
    if ('strokes' in node && node.strokes && isArrayValue(node.strokes) && node.strokes.length > 0) {
      return true;
    }
    
    // Check for effects
    if ('effects' in node && node.effects && isArrayValue(node.effects) && node.effects.length > 0) {
      return true;
    }
    
    // Check for corner radius
    if (isFrameNode(node) && 'cornerRadius' in node && isNumberValue(node.cornerRadius) && node.cornerRadius > 0) {
      return true;
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

// Layout compatibility issues (for sibling dissolution)
function hasLayoutIncompatibilities(sibling: FrameNode, parent: FrameNode): boolean {
  try {
    if (!nodeExists(sibling) || !nodeExists(parent)) return true;
    if (!hasAutoLayout(sibling) || !hasAutoLayout(parent)) return true;
    
    // Check absolute children
    const absoluteChildren = getAbsoluteChildren(sibling);
    if (absoluteChildren.length > 0) {
      return true;
    }
    
    // Check constraints
    if ('constraints' in sibling && sibling.constraints) {
      const constraints = sibling.constraints;
      if (constraints.horizontal !== 'MIN' || constraints.vertical !== 'MIN') {
        return true;
      }
    }
    
    // Check parent-sibling compatibility
    if (!isParentSiblingCompatible(parent, sibling)) {
      return true;
    }
    
    // Check layout mode compatibility
    const layoutChildren = getLayoutChildren(sibling);
    const siblingException = layoutChildren.length === 1;
    
    if (!siblingException && sibling.layoutMode !== parent.layoutMode) {
      return true;
    }
    
    // Check spacing compatibility
    const siblingSpacing = getChildSpacingInfo(sibling);
    const parentSpacing = getChildSpacingInfo(parent);
    
    if (siblingSpacing.hasAutoGap !== parentSpacing.hasAutoGap) {
      return true;
    }
    
    if (Math.abs(siblingSpacing.impliedGapPixels - parentSpacing.impliedGapPixels) > 0.01) {
      return true;
    }
    
    return false;
  } catch (error) {
    return true;
  }
}

// Style ID constraint issues (for design token preservation)
function hasStyleIdConflicts(node: FrameNode | GroupNode): boolean {
  try {
    if (!nodeExists(node)) return true;
    
    // Fill style ID
    if ('fillStyleId' in node && isStringValue(node.fillStyleId) && node.fillStyleId !== '') {
      return true;
    }
    
    // Stroke style ID  
    if ('strokeStyleId' in node && isStringValue(node.strokeStyleId) && node.strokeStyleId !== '') {
      return true;
    }
    
    // Effect style ID
    if ('effectStyleId' in node && isStringValue(node.effectStyleId) && node.effectStyleId !== '') {
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
  
  // TRANCHE 1: Use refactored constraint functions
  
  // Component safety check
  if (hasComponentIssues(sibling)) {
    return false;
  }
  
  // High-risk safety constraints
  if (hasHighRiskSafetyIssues(sibling)) {
    return false;
  }
  
  // Visual property constraints
  if (hasVisualPropertyIssues(sibling)) {
    return false;
  }
  
  // Layout incompatibilities
  if (hasLayoutIncompatibilities(sibling, parent)) {
    return false;
  }
  
  // Check main-axis padding requirement
  if (requireZeroPadding && !siblingHasZeroPadding(sibling)) {
    return false;
  }
  
  // Style ID conflicts (design token preservation)
  if (hasStyleIdConflicts(sibling)) {
    return false;
  }
  
  // Fill compatibility
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

// Initialize plugin
figma.showUI(__html__, { width: 350, height: 450 });

console.log('Frame Cleaner Plugin - Tranche 1: Constraint Refactoring initialized');

let cleaningResults: CleaningResults = {
  framesAnalyzed: 0,
  framesMerged: 0,
  siblingGroupsOptimized: 0,
  siblingsRemoved: 0,
  paddingOptimized: 0,
  issues: []
};

// Store frames with active temporary strokes for cleanup
let framesWithActiveStrokes: Map<string, {
  node: FrameNode;
  originalStrokes: readonly Paint[];
  originalStrokeWeight: number;
  originalStrokeAlign: 'INSIDE' | 'OUTSIDE' | 'CENTER';
  originalStrokeStyleId: string;
}> = new Map();

// Cleanup function to remove all active strokes
function cleanupActiveStrokes(): void {
  framesWithActiveStrokes.forEach((data, nodeId) => {
    try {
      const { node, originalStrokes, originalStrokeWeight, originalStrokeAlign, originalStrokeStyleId } = data;
      
      if (nodeExists(node)) {
        // Restore original stroke style first (for variables)
        if (originalStrokeStyleId && 'strokeStyleId' in node) {
          node.strokeStyleId = originalStrokeStyleId;
        } else if ('strokeStyleId' in node) {
          node.strokeStyleId = '';
        }
        
        // Restore original strokes
        node.strokes = originalStrokes;
        
        // Restore other properties
        if (originalStrokeWeight > 0) {
          node.strokeWeight = originalStrokeWeight;
        }
        
        node.strokeAlign = originalStrokeAlign;
      }
    } catch (error) {
      console.error('Error cleaning up stroke for node:', nodeId, error);
    }
  });
  
  // Clear the tracking map
  framesWithActiveStrokes.clear();
}

// Plugin close handler
figma.on('close', () => {
  cleanupActiveStrokes();
});

// Store the analyzed frame for optimization
let analyzedFrame: SceneNode | null = null;
let analyzedFrameData: AnalysisResults | null = null;

// Selection change monitoring with immediate analysis
figma.on('selectionchange', (): void => {
  const selection = figma.currentPage.selection;
  const hasSelection: boolean = selection.length > 0;
  
  if (hasSelection) {
    // Immediate analysis on selection change
    const results: AnalysisResults = analyzeFrames(selection);
    
    // Determine frame name for display
    if (selection.length === 1) {
      results.frameName = safeGetNodeName(selection[0]);
      results.frameId = selection[0].id;
    } else {
      results.frameName = 'Multiple Frames selected';
      results.frameId = 'multiple';
    }
    
    // Store for optimization
    analyzedFrame = selection[0];
    analyzedFrameData = results;
    
    figma.ui.postMessage({
      type: 'analysis-result',
      hasSelection: true,
      results: results
    });
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

// Send initial selection state
setTimeout((): void => {
  const selection = figma.currentPage.selection;
  const hasSelection: boolean = selection.length > 0;
  
  if (hasSelection) {
    // Immediate analysis on plugin open if something is selected
    const results: AnalysisResults = analyzeFrames(selection);
    
    if (selection.length === 1) {
      results.frameName = safeGetNodeName(selection[0]);
      results.frameId = selection[0].id;
    } else {
      results.frameName = 'Multiple Frames selected';
      results.frameId = 'multiple';
    }
    
    analyzedFrame = selection[0];
    analyzedFrameData = results;
    
    figma.ui.postMessage({
      type: 'analysis-result',
      hasSelection: true,
      results: results
    });
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
    default:
      console.log('Unknown message type:', msg.type);
  }
};

// Locate frame with temporary highlight
function locateFrame(nodeId: string): void {
  try {
    const node = figma.getNodeById(nodeId);
    
    if (!node || !nodeExists(node)) {
      figma.notify("Frame not found");
      return;
    }
    
    // Check if node is a SceneNode first
    if (!('type' in node) || !node.type) {
      figma.notify("Invalid node type");
      return;
    }
    
    const sceneNode = node as SceneNode;
    
    // Only zoom to the frame (don't select it)
    figma.viewport.scrollAndZoomIntoView([sceneNode]);
    
    // Add temporary blue stroke if it's a frame
    if (isFrameNode(sceneNode)) {
      // Store original values with safe symbol handling and variable support
      const originalStrokes = sceneNode.strokes;
      const originalStrokeWeight = isNumberValue(sceneNode.strokeWeight) ? sceneNode.strokeWeight : 0;
      const originalStrokeAlign = sceneNode.strokeAlign;
      
      // Also store stroke style ID for variable-bound strokes
      const originalStrokeStyleId = ('strokeStyleId' in sceneNode && isStringValue(sceneNode.strokeStyleId)) 
        ? sceneNode.strokeStyleId 
        : '';
      
      // Track this frame for cleanup
      framesWithActiveStrokes.set(nodeId, {
        node: sceneNode,
        originalStrokes,
        originalStrokeWeight,
        originalStrokeAlign,
        originalStrokeStyleId
      });
      
      // Apply blue highlight stroke
      sceneNode.strokes = [{
        type: 'SOLID',
        color: { r: 0.2, g: 0.4, b: 1 }, // Blue color
        visible: true
      }];
      sceneNode.strokeWeight = 3;
      sceneNode.strokeAlign = 'INSIDE';
      
      // Clear any stroke style to ensure our blue color shows
      if ('strokeStyleId' in sceneNode) {
        sceneNode.strokeStyleId = '';
      }
      
      // Remove stroke after 1 second (reduced from 2)
      setTimeout(() => {
        try {
          if (nodeExists(sceneNode) && framesWithActiveStrokes.has(nodeId)) {
            // Gradually fade stroke by reducing opacity first
            if (sceneNode.strokes && isArrayValue(sceneNode.strokes) && sceneNode.strokes.length > 0) {
              const currentStroke = sceneNode.strokes[0];
              if (currentStroke.type === 'SOLID') {
                sceneNode.strokes = [{
                  type: 'SOLID',
                  color: { 
                    r: currentStroke.color.r, 
                    g: currentStroke.color.g, 
                    b: currentStroke.color.b 
                  },
                  opacity: 0.3,
                  visible: true
                }];
              }
            }
            
            // Complete removal after short fade
            setTimeout(() => {
              if (nodeExists(sceneNode) && framesWithActiveStrokes.has(nodeId)) {
                try {
                  const data = framesWithActiveStrokes.get(nodeId);
                  if (data) {
                    // Restore original stroke style first (for variables)
                    if (data.originalStrokeStyleId && 'strokeStyleId' in sceneNode) {
                      sceneNode.strokeStyleId = data.originalStrokeStyleId;
                    } else if ('strokeStyleId' in sceneNode) {
                      sceneNode.strokeStyleId = '';
                    }
                    
                    // Then restore strokes (this maintains variable bindings)
                    sceneNode.strokes = data.originalStrokes;
                    
                    // Restore other properties
                    if (data.originalStrokeWeight > 0) {
                      sceneNode.strokeWeight = data.originalStrokeWeight;
                    }
                    
                    sceneNode.strokeAlign = data.originalStrokeAlign;
                    
                    // Remove from tracking since it's complete
                    framesWithActiveStrokes.delete(nodeId);
                  }
                } catch (restoreError) {
                  console.error('Error in detailed restoration:', restoreError);
                  // Fallback: use cleanup function
                  const data = framesWithActiveStrokes.get(nodeId);
                  if (data) {
                    try {
                      sceneNode.strokes = data.originalStrokes;
                      sceneNode.strokeAlign = data.originalStrokeAlign;
                      framesWithActiveStrokes.delete(nodeId);
                    } catch (fallbackError) {
                      console.error('Fallback restoration failed:', fallbackError);
                      framesWithActiveStrokes.delete(nodeId); // Remove even if restoration failed
                    }
                  }
                }
              }
            }, 200);
          }
        } catch (error) {
          console.error('Error during fade:', error);
          // Emergency cleanup
          if (framesWithActiveStrokes.has(nodeId)) {
            const data = framesWithActiveStrokes.get(nodeId);
            if (data && nodeExists(sceneNode)) {
              try {
                sceneNode.strokes = data.originalStrokes;
                if (data.originalStrokeStyleId && 'strokeStyleId' in sceneNode) {
                  sceneNode.strokeStyleId = data.originalStrokeStyleId;
                }
                framesWithActiveStrokes.delete(nodeId);
              } catch (emergencyError) {
                console.error('Emergency restoration failed:', emergencyError);
                framesWithActiveStrokes.delete(nodeId); // Remove even if failed
              }
            }
          }
        }
      }, 1000); // Changed from 2000ms to 1000ms
    }
    
  } catch (error) {
    console.error('Error in locateFrame:', error);
    figma.notify("Error locating frame");
  }
}

function optimizeSelection(): void {
  // Use stored analyzed frame for optimization
  if (analyzedFrame && nodeExists(analyzedFrame)) {
    cleanFrames([analyzedFrame]);
    
    // Clear the stored frame after optimization
    analyzedFrame = null;
    analyzedFrameData = null;
    
    // After optimization, trigger a new analysis if there's still a selection
    setTimeout(() => {
      const selection = figma.currentPage.selection;
      if (selection.length > 0) {
        const results: AnalysisResults = analyzeFrames(selection);
        
        if (selection.length === 1) {
          results.frameName = safeGetNodeName(selection[0]);
          results.frameId = selection[0].id;
        } else {
          results.frameName = 'Multiple Frames selected';
          results.frameId = 'multiple';
        }
        
        analyzedFrame = selection[0];
        analyzedFrameData = results;
        
        figma.ui.postMessage({
          type: 'analysis-result',
          hasSelection: true,
          results: results
        });
      }
    }, 100);
    
    return;
  }
  
  // Fallback to current selection if no analyzed frame is stored
  const selection: readonly SceneNode[] = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.notify("Please select some frames first");
    return;
  }
  
  cleanFrames(selection);
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
    
    // TRANCHE 1: Explicit component checking
    if (hasComponentIssues(node)) return;
    
    if (isFrameOrGroup(node)) {
      results.totalFrames++;
      
      if (canBeMerged(node) && nodeExists(node)) {
        results.mergeableFrames++;
        results.removableFrames++;
        
        const parent = getParentFrame(node);
        const parentName = parent ? safeGetNodeName(parent) : 'Root';
        const inheritance = calculateInheritanceDetails(node, parent || node);
        
        results.removableFrameInfos.push({
          name: safeGetNodeName(node),
          nodeId: node.id,
          parentName: parentName,
          inheritance: inheritance
        });
      }
      
      if (isFrameNode(node) && hasAutoLayout(node) && nodeExists(node)) {
        const layoutChildren = getLayoutChildren(node);
        const siblingFrames = layoutChildren.filter(child => isFrameNode(child) && nodeExists(child)) as FrameNode[];
        
        if (siblingFrames.length > 0) {
          // TRANCHE 2: Unified analysis - check each sibling individually
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
  
  // TRANCHE 1: Use refactored constraint functions
  
  // Component safety check
  if (hasComponentIssues(parent) || hasComponentIssues(child)) {
    return false;
  }
  
  // High-risk safety constraints (both parent and child)
  if (hasHighRiskSafetyIssues(parent) || hasHighRiskSafetyIssues(child)) {
    return false;
  }
  
  // Visual property constraints (child only - TRANCHE 1 CHANGE)
  if (hasVisualPropertyIssues(child)) {
    return false;
  }
  
  // Dimensional constraints (child only)
  if (hasDimensionalIssues(child, !sameDimensions)) {
    return false;
  }
  
  // Fill compatibility
  if (!fillsAreCompatible(parent, child, sameDimensions)) {
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
      
      // UPDATED: Use exact same constraint checks as optimization logic
      
      // Component safety check (both parent and child)
      if (hasComponentIssues(node)) reason += 'parent is component, ';
      if (hasComponentIssues(child)) reason += 'child is component, ';
      
      // High-risk safety constraints (both parent and child)
      if (hasHighRiskSafetyIssues(node)) reason += 'parent has transforms/interactions/advanced layouts, ';
      if (hasHighRiskSafetyIssues(child)) reason += 'child has transforms/interactions/advanced layouts, ';
      
      // Visual property constraints (child only - Tranche 1 change)
      if (hasVisualPropertyIssues(child)) reason += 'child has complex fills/strokes/clipping/layouts, ';
      
      // Dimensional constraints (child only)
      if (hasDimensionalIssues(child, !sameDimensions)) reason += 'child has strokes/effects/corners with different dimensions, ';
      
      // Fill compatibility (updated for Tranche 3 simplified logic)
      if (!fillsAreCompatible(node, child, sameDimensions)) {
        const parentHasStyleID = ('fillStyleId' in node && isStringValue(node.fillStyleId) && node.fillStyleId !== '');
        const childHasStyleID = ('fillStyleId' in child && isStringValue(child.fillStyleId) && child.fillStyleId !== '');
        
        if (parentHasStyleID && childHasStyleID) {
          reason += 'different design tokens, ';
        } else if (!parentHasStyleID && !childHasStyleID) {
          reason += 'different hex colors, ';
        } else {
          reason += 'design token vs hex color (future enhancement), ';
        }
      }
      
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
    
    // TRANCHE 1: Explicit component checking at entry point
    if (hasComponentIssues(node)) return;
    
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
  
  const totalFramesRemoved = cleaningResults.framesMerged + cleaningResults.siblingsRemoved;
  
  if (totalFramesRemoved === 0) {
    figma.notify("Your layers are fully optimized!");
  } else {
    figma.notify(`${totalFramesRemoved} frame${totalFramesRemoved !== 1 ? 's' : ''} removed`);
  }
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
  
  // TRANCHE 3: Enhanced fill and style ID transfer logic
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
      
      // TRANCHE 3: Enhanced fill and style ID transfer using figma.getStyleById()
      const parentHasStyleID = ('fillStyleId' in parentFrame && isStringValue(parentFrame.fillStyleId) && parentFrame.fillStyleId !== '');
      const childHasStyleID = (isStringValue(childFillStyleId) && childFillStyleId !== '');
      
      if (childHasStyleID) {
        // Child has style ID - transfer it to parent (prioritize design tokens)
        if (isFrameNode(parentFrame) && 'fillStyleId' in parentFrame) {
          parentFrame.fillStyleId = childFillStyleId;
          // Clear fills when using style ID
          if ('fills' in parentFrame) {
            parentFrame.fills = [];
          }
        }
      } else if (parentHasStyleID && childFills.length > 0) {
        // Parent has style ID, child has hex - check if style color matches child's hex
        if (isStringValue(parentFrame.fillStyleId) && styleColorMatchesNodeColors(parentFrame.fillStyleId, childFrame as FrameNode | GroupNode)) {
          // Colors match - keep parent's style ID (prioritize design tokens)
          // No changes needed, parent keeps its style ID
        } else {
          // Colors don't match - use child's fills
          if ('fills' in parentFrame) {
            parentFrame.fills = childFills;
            parentFrame.fillStyleId = '';
          }
        }
      } else if (!parentHasStyleID && childFills.length > 0) {
        // Neither has style ID - transfer child fills
        if ('fills' in parentFrame) {
          parentFrame.fills = childFills;
        }
      } else if ((!('fills' in parentFrame) || !parentFrame.fills || !isArrayValue(parentFrame.fills) || parentFrame.fills.length === 0) && childFills.length > 0) {
        // Parent has no fills, child has fills - transfer them
        if ('fills' in parentFrame) {
          parentFrame.fills = childFills;
        }
      }
      
    } catch (error) {
      // Silent fail
    }
  } else if (nodeExists(parentFrame)) {
    // TRANCHE 3: Simplified fill transfer for non-matching dimensions
    const parentHasStyleID = ('fillStyleId' in parentFrame && isStringValue(parentFrame.fillStyleId) && parentFrame.fillStyleId !== '');
    const childHasStyleID = (isStringValue(childFillStyleId) && childFillStyleId !== '');
    
    if ((!('fills' in parentFrame) || !parentFrame.fills || !isArrayValue(parentFrame.fills) || parentFrame.fills.length === 0) && 
        !parentHasStyleID) {
      try {
        if (childHasStyleID) {
          // Child has style ID - transfer it
          if (isFrameNode(parentFrame) && 'fillStyleId' in parentFrame) {
            parentFrame.fillStyleId = childFillStyleId;
          }
        } else if (childFills.length > 0) {
          // Child has fills - transfer them
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