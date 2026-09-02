import { visit } from 'unist-util-visit';

export default function rehypeEuropaTables() {
    return (tree, file) => {
        visit(tree, 'element', (node) => {
            if (node.tagName === 'table') {
                node.properties = node.properties || {};
                node.properties.class = [node.properties.class, 'europa-table']
                    .filter(Boolean)
                    .join(' ');
            }
        });
    };
}
