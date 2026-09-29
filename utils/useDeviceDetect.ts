import { useState, useEffect } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isMobileOrTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
}

const getDeviceInfo = (): DeviceInfo => {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isTablet: false,
      isMobileOrTablet: false,
      isDesktop: true,
      isTouch: false,
      orientation: 'landscape',
      width: 1280,
      height: 800
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isTouch =
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore
    (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0);

  const userAgent = navigator.userAgent || '';
  const isTabletUA = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk)/i.test(
    userAgent
  );
  const isMobileUA = /(android|iphone|ipod|blackberry|iemobile|opera mini)/i.test(userAgent);

  // Criteria for Phone vs Tablet vs Desktop:
  // Mobile phone: width < 768px (or mobile UA with width < 768)
  const isMobile = width < 768 || (isMobileUA && width < 768);

  // Tablet: width >= 768 and width <= 1024 (e.g. iPad, iPad Air, Galaxy Tab)
  // or tablet UA / touch device with width <= 1180 in landscape or portrait
  const isTablet =
    !isMobile &&
    ((width >= 768 && width <= 1024) ||
      (isTabletUA && width <= 1280) ||
      (isTouch && width >= 768 && width <= 1180 && height <= 1366));

  const isMobileOrTablet = isMobile || isTablet;
  const isDesktop = !isMobileOrTablet;
  const orientation = height > width ? 'portrait' : 'landscape';

  return {
    isMobile,
    isTablet,
    isMobileOrTablet,
    isDesktop,
    isTouch,
    orientation,
    width,
    height
  };
};

export function useDeviceDetect(): DeviceInfo {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo);

  useEffect(() => {
    let timeoutId: any = null;

    const handleResizeOrOrientation = () => {
      // Direct update with small debounce
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDeviceInfo(getDeviceInfo());
      }, 50);
    };

    window.addEventListener('resize', handleResizeOrOrientation);
    window.addEventListener('orientationchange', handleResizeOrOrientation);

    // Initial check
    setDeviceInfo(getDeviceInfo());

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResizeOrOrientation);
      window.removeEventListener('orientationchange', handleResizeOrOrientation);
    };
  }, []);

  return deviceInfo;
}
