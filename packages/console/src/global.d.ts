export {};

declare module 'react' {
    namespace JSX {
        interface IntrinsicElements {
            'europa-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                variant?: string;
                size?: string;
                disabled?: boolean;
                type?: string;
            };
            'europa-banner': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                variant?: string;
            };
            'europa-waiting': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                message?: string;
                'reduced-motion'?: string;
            };
        }
    }
}
