"use client";
import { createContext, useContext, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

const ThemeContext = createContext({ isDark: true, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 默认设为 true，这样在读取到配置前，如果是夜间模式就不会闪烁
  const [isDark, setIsDark] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 标记组件已挂载，避免 hydration 报错
    setMounted(true);

    // 从 localStorage 读取真实状态
    const savedTheme = localStorage.getItem('blog-theme');
    // 如果没有记录，默认给深色模式（流萤飞舞）
    const isDarkMode = savedTheme !== 'light';
    setIsDark(isDarkMode);

    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  // 极其重要：监听 isDark 状态，只要它变了，立刻强制更新 html 标签，防止路由切换丢失
  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark, mounted]);

  const applyDomTheme = (dark: boolean) => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('blog-theme', dark ? 'dark' : 'light');
  };

  const toggleTheme = () => {
    const newDark = !isDark;
    const root = document.documentElement;
    // 切换瞬间禁用所有子元素的长耗时 CSS transition，避免毛玻璃卡片逐帧重绘导致掉帧
    root.classList.add('theme-switching');

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const docWithTransition = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    if (typeof docWithTransition.startViewTransition === 'function' && !prefersReducedMotion) {
      const transition = docWithTransition.startViewTransition(() => {
        flushSync(() => {
          setIsDark(newDark);
        });
        applyDomTheme(newDark);
      });
      transition.finished.finally(() => {
        root.classList.remove('theme-switching');
      });
      return;
    }

    setIsDark(newDark);
    applyDomTheme(newDark);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });
  };

  // 在客户端挂载完成前，为了防止闪屏，先隐藏内容
  if (!mounted) {
    return <div className="invisible">{children}</div>;
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);