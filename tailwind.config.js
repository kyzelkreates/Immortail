/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Immortail brand palette
        immortail: {
          gold:    '#C9A84C',
          'gold-light': '#E5C97A',
          'gold-dark':  '#9A7A2E',
          cream:   '#F5EDD8',
          warm:    '#F0E0C0',
          dusk:    '#2C1F0F',
          deep:    '#1A1208',
          slate:   '#3D3020',
          mist:    '#F8F4EE',
          shadow:  '#6B5435',
          blush:   '#C4896A',
          teal:    '#4A8C8C',
          soft:    '#8C7A5E',
        }
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body:    ['"Inter"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
      backgroundImage: {
        'immortail-hero':    'linear-gradient(135deg, #1A1208 0%, #2C1F0F 40%, #3D3020 70%, #C9A84C22 100%)',
        'immortail-warm':    'linear-gradient(135deg, #F5EDD8 0%, #F0E0C0 100%)',
        'immortail-dark':    'linear-gradient(180deg, #1A1208 0%, #2C1F0F 100%)',
        'gold-shimmer':      'linear-gradient(90deg, #9A7A2E, #C9A84C, #E5C97A, #C9A84C, #9A7A2E)',
      },
      boxShadow: {
        'immortail':    '0 8px 32px rgba(201,168,76,0.15), 0 2px 8px rgba(0,0,0,0.3)',
        'immortail-lg': '0 16px 64px rgba(201,168,76,0.2), 0 4px 16px rgba(0,0,0,0.4)',
        'glass':        '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'tail-wag':       'tailWag 0.6s ease-in-out infinite alternate',
        'breathe':        'breathe 3s ease-in-out infinite',
        'blink':          'blink 4s ease-in-out infinite',
        'ear-twitch':     'earTwitch 2s ease-in-out infinite',
        'gold-shimmer':   'goldShimmer 3s ease-in-out infinite',
        'float':          'float 4s ease-in-out infinite',
        'pulse-soft':     'pulseSoft 2s ease-in-out infinite',
        'fade-in':        'fadeIn 0.6s ease-out forwards',
        'slide-up':       'slideUp 0.5s ease-out forwards',
      },
      keyframes: {
        tailWag:      { '0%': { transform: 'rotate(-20deg)' }, '100%': { transform: 'rotate(20deg)' } },
        breathe:      { '0%,100%': { transform: 'scaleY(1)' }, '50%': { transform: 'scaleY(1.04)' } },
        blink:        { '0%,90%,100%': { scaleY: 1 }, '95%': { scaleY: 0.05 } },
        earTwitch:    { '0%,100%': { transform: 'rotate(0deg)' }, '50%': { transform: 'rotate(-5deg)' } },
        goldShimmer:  { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        float:        { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        pulseSoft:    { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.7 } },
        fadeIn:       { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:      { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      transitionTimingFunction: {
        'immortail': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      }
    }
  },
  plugins: []
};
