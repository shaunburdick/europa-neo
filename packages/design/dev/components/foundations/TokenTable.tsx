import type React from 'react';
import { buildTokenGroups } from '../../lib/token-utils';

/**
 * TokenReference — renders the complete token reference table.
 *
 * Displays all token groups from {@link buildTokenGroups} with each group
 * as a section containing a table of Token Name, CSS Variable, and Value.
 * Groups flagged as "New" (shadows, motion) receive a badge.
 *
 * @returns A React element containing the full token reference table.
 */
export function TokenReference(): React.ReactElement {
    const groups = buildTokenGroups();

    return (
        <section id="tokens" className="dev-section">
            <h2 className="dev-section__heading">Token Reference</h2>
            <p className="dev-section__desc">Complete token table</p>
            {groups.map((group) => (
                <div key={group.title}>
                    <h3 className="dev-section__subheading">
                        {group.title}
                        {group.isNew && <span className="dev-badge">New</span>}
                    </h3>
                    <table className="dev-token-table">
                        <thead>
                            <tr>
                                <th>Token</th>
                                <th>CSS Variable</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {group.entries.map((entry) => (
                                <tr key={entry.name}>
                                    <td>{entry.name}</td>
                                    <td>
                                        <code>{entry.cssVar}</code>
                                    </td>
                                    <td>{entry.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </section>
    );
}
