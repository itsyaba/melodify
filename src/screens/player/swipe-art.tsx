import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, type PanResponderInstance } from 'react-native';

/** A swipe counts once it has travelled this share of the artwork, or was flicked. */
const DISTANCE = 0.25;
const FLICK = 0.6;

interface Props {
  children: ReactNode;
  width: number;
  canNext: boolean;
  canPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  /** True while a swipe is under way, so the screen can stop its own scrolling meanwhile. */
  onActive: (active: boolean) => void;
}

/**
 * The artwork follows a sideways swipe: left for the next song, right for the previous one, as
 * in Spotify and Musicolet. Taps still reach the artwork underneath, since the swipe only claims
 * the touch once it is clearly sideways. With nothing to go to, it springs back.
 */
export function SwipeArt({ children, ...props }: Props) {
  const x = useRef(new Animated.Value(0)).current;
  // Built once, so the handlers read live props from here rather than the first render's.
  const live = useRef(props);
  live.current = props;
  const responder = useRef<PanResponderInstance>(undefined);

  if (!responder.current) {
    const settle = () => {
      live.current.onActive(false);
      Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
    };
    responder.current = PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => live.current.onActive(true),
      onPanResponderMove: (_e, g) => {
        const { canNext, canPrevious } = live.current;
        // Against the grain of a missing song it only gives a little.
        const blocked = (g.dx < 0 && !canNext) || (g.dx > 0 && !canPrevious);
        x.setValue(blocked ? g.dx * 0.2 : g.dx);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        const { width, canNext, canPrevious, onNext, onPrevious } = live.current;
        const forward = g.dx < 0;
        const far = Math.abs(g.dx) > width * DISTANCE || Math.abs(g.vx) > FLICK;
        if (!far || (forward ? !canNext : !canPrevious)) return settle();
        Animated.timing(x, { toValue: forward ? -width : width, duration: 140, useNativeDriver: true }).start(() => {
          (forward ? onNext : onPrevious)();
          // The new song's artwork comes in from the other side.
          x.setValue(forward ? width * 0.5 : -width * 0.5);
          settle();
        });
      },
      onPanResponderTerminate: settle,
    });
  }

  const w = Math.max(1, props.width);
  const opacity = x.interpolate({
    inputRange: [-w, 0, w],
    outputRange: [0.2, 1, 0.2],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View {...responder.current.panHandlers} style={{ transform: [{ translateX: x }], opacity }}>
      {children}
    </Animated.View>
  );
}
