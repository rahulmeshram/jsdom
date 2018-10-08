"use strict";

const NODE_TYPE = require("../node-type");
const { domSymbolTree } = require("./internal-constants");

// Valid host element for ShadowRoot.
// Defined in: https://dom.spec.whatwg.org/#dom-element-attachshadow
const VALID_HOST_ELEMENT_NAME = new Set([
  "article",
  "aside",
  "blockquote",
  "body",
  "div",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "main",
  "nav",
  "p",
  "section",
  "span"
]);

function isValidHostElementName(name) {
  return VALID_HOST_ELEMENT_NAME.has(name);
}

// Use an approximation by checking the presence of nodeType instead of instead of using the isImpl from
// "../generated/Node" to avoid introduction of circular dependencies.
function isNode(nodeImpl) {
  return Boolean(nodeImpl && "nodeType" in nodeImpl);
}

// Use an approximation by checking the value of nodeType and presence of nodeType host instead of instead
// of using the isImpl from "../generated/ShadowRoot" to avoid introduction of circular dependencies.
function isShadowRoot(nodeImpl) {
  return Boolean(nodeImpl && nodeImpl.nodeType === NODE_TYPE.DOCUMENT_FRAGMENT_NODE && "host" in nodeImpl);
}

// https://dom.spec.whatwg.org/#concept-slotable
function isSlotable(nodeImpl) {
  return nodeImpl && (nodeImpl.nodeType === NODE_TYPE.ELEMENT_NODE || nodeImpl.nodeType === NODE_TYPE.TEXT_NODE);
}

// https://dom.spec.whatwg.org/#concept-shadow-including-inclusive-ancestor
function isShadowInclusiveAncestor(ancestor, node) {
  while (isNode(node)) {
    if (node === ancestor) {
      return true;
    }

    if (isShadowRoot(node)) {
      node = node.host;
    } else {
      node = domSymbolTree.parent(node);
    }
  }

  return false;
}

// https://dom.spec.whatwg.org/#retarget
function retarget(a, b) {
  while (true) {
    if (!isNode(a)) {
      return a;
    }

    const aRoot = getRoot(a);
    if (
      !isShadowRoot(aRoot) ||
      (isNode(b) && isShadowInclusiveAncestor(aRoot, b))
    ) {
      return a;
    }

    a = getRoot(a).host;
  }
}

// https://dom.spec.whatwg.org/#get-the-parent
function getEventTargetParent(eventTarget, event) {
  // _getTheParent will be missing for Window, since it doesn't have an impl class and we don't want to pollute the
  // user-visible global scope with a _getTheParent value. TODO: remove this entire function and use _getTheParent
  // directly, once Window gets split into impl/wrapper.
  return eventTarget._getTheParent ? eventTarget._getTheParent(event) : null;
}

function getRoot(node) {
  let root;

  for (const ancestor of domSymbolTree.ancestorsIterator(node)) {
    root = ancestor;
  }

  return root;
}

// https://dom.spec.whatwg.org/#concept-shadow-including-root
function shadowIncludingRoot(node) {
  const root = getRoot(node);
  return isShadowRoot(root) ? shadowIncludingRoot(root.host) : root;
}

// https://dom.spec.whatwg.org/#assign-a-slot
function assignSlot(slotable) {
  const slot = findSlot(slotable);

  if (slot) {
    assignSlotable(slot);
  }
}

// https://dom.spec.whatwg.org/#assign-slotables
function assignSlotable(slot) {
  const slotables = findSlotable(slot);

  slot._assignedNodes = slotables;

  for (const slotable of slotables) {
    slotable._assignedSlot = slot;
  }
}

// https://dom.spec.whatwg.org/#assign-slotables-for-a-tree
function assignSlotableForTree(root) {
  for (const slot of domSymbolTree.treeIterator(root)) {
    if (slot.localName === "slot") {
      assignSlotable(slot);
    }
  }
}

// https://dom.spec.whatwg.org/#find-slotables
function findSlotable(slot) {
  const result = [];

  const root = getRoot(slot);
  if (!isShadowRoot(root)) {
    return result;
  }

  for (const slotable of domSymbolTree.treeIterator(root.host)) {
    const foundSlot = findSlot(slotable);

    if (foundSlot === slot) {
      result.push(slotable);
    }
  }

  return result;
}

// https://dom.spec.whatwg.org/#find-flattened-slotables
function findFlattenedSlotables(slot) {
  const result = [];

  const root = getRoot(slot);
  if (!isShadowRoot(root)) {
    return result;
  }

  const slotables = findSlotable(slot);

  if (slotables.length === 0) {
    for (const child of domSymbolTree.childrenIterator(slot)) {
      if (isSlotable(child)) {
        slotables.push(child);
      }
    }
  }

  for (const node of slotables) {
    if (node.localName === "slot" && isShadowRoot(getRoot(node))) {
      const temporaryResult = findFlattenedSlotables(node);
      result.push(...temporaryResult);
    } else {
      result.push(node);
    }
  }

  return result;
}

// https://dom.spec.whatwg.org/#find-a-slot
function findSlot(slotable, openFlag) {
  const { parentNode: parent } = slotable;

  if (!parent) {
    return null;
  }

  const shadow = parent._shadowRoot;

  if (!shadow || (openFlag && shadow.mode !== "open")) {
    return null;
  }

  for (const child of domSymbolTree.treeIterator(shadow)) {
    if (child.localName === "slot" && child.name === slotable._slotableName) {
      return child;
    }
  }

  return null;
}

module.exports = {
  isValidHostElementName,

  isNode,
  isSlotable,
  isShadowRoot,

  isShadowInclusiveAncestor,
  retarget,
  getEventTargetParent,
  getRoot,
  shadowIncludingRoot,

  assignSlot,
  assignSlotable,
  assignSlotableForTree,

  findSlot,
  findFlattenedSlotables
};