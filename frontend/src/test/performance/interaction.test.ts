import { describe, it, expect } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { performance } from 'perf_hooks';

/**
 * Interaction Performance Tests
 * 
 * These tests measure interaction response times to ensure
 * the app feels responsive (< 100ms for user interactions).
 */

describe('Interaction Performance', () => {
  const INTERACTION_BUDGET_MS = 100;

  it('should respond to button clicks within 100ms', async () => {
    let clickHandled = false;
    const handleClick = () => {
      clickHandled = true;
    };
    
    const { Button } = await import('../../components/UI/Button');
    const { getByRole } = render(<Button onClick={handleClick}>Click</Button>);
    
    const button = getByRole('button');
    const start = performance.now();
    
    fireEvent.click(button);
    
    await waitFor(() => expect(clickHandled).toBe(true));
    
    const duration = performance.now() - start;
    
    console.log(`Button click response time: ${duration.toFixed(2)}ms`);
    
    expect(duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it('should handle form input changes efficiently', async () => {
    const { useState } = await import('react');
    
    const InputComponent = () => {
      const [value, setValue] = useState('');
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="test-input"
        />
      );
    };
    
    const { getByLabelText } = render(<InputComponent />);
    const input = getByLabelText('test-input') as HTMLInputElement;
    
    const start = performance.now();
    
    fireEvent.change(input, { target: { value: 'test' } });
    
    await waitFor(() => expect(input.value).toBe('test'));
    
    const duration = performance.now() - start;
    
    console.log(`Input change response time: ${duration.toFixed(2)}ms`);
    
    expect(duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it('should handle rapid state updates efficiently', async () => {
    const { useState } = await import('react');
    
    const Counter = () => {
      const [count, setCount] = useState(0);
      return (
        <div>
          <span data-testid="count">{count}</span>
          <button onClick={() => setCount(c => c + 1)}>+</button>
        </div>
      );
    };
    
    const { getByRole, getByTestId } = render(<Counter />);
    const button = getByRole('button');
    
    const start = performance.now();
    
    // Simulate rapid clicks
    for (let i = 0; i < 10; i++) {
      fireEvent.click(button);
    }
    
    await waitFor(() => expect(getByTestId('count').textContent).toBe('10'));
    
    const duration = performance.now() - start;
    const avgPerClick = duration / 10;
    
    console.log(`Average response time for 10 rapid clicks: ${avgPerClick.toFixed(2)}ms`);
    
    expect(avgPerClick).toBeLessThan(INTERACTION_BUDGET_MS);
  });

  it('should handle scroll events efficiently', async () => {
    const ScrollComponent = () => {
      const items = Array.from({ length: 1000 }, (_, i) => i);
      return (
        <div
          style={{ height: '500px', overflow: 'auto' }}
          data-testid="scroll-container"
        >
          {items.map(i => (
            <div key={i} style={{ height: '50px' }}>
              Item {i}
            </div>
          ))}
        </div>
      );
    };
    
    const { getByTestId } = render(<ScrollComponent />);
    const container = getByTestId('scroll-container');
    
    const start = performance.now();
    
    // Simulate scroll
    fireEvent.scroll(container, { target: { scrollTop: 1000 } });
    
    const duration = performance.now() - start;
    
    console.log(`Scroll event handling time: ${duration.toFixed(2)}ms`);
    
    expect(duration).toBeLessThan(INTERACTION_BUDGET_MS);
  });
});

describe('Animation Performance', () => {
  const TARGET_FPS = 60;
  const FRAME_BUDGET_MS = 1000 / TARGET_FPS; // ~16.67ms

  it('should maintain 60fps during animations', async () => {
    // Mock requestAnimationFrame
    let frameCount = 0;
    const frameTimes: number[] = [];
    let lastTime = performance.now();
    
    const animate = () => {
      const currentTime = performance.now();
      const frameTime = currentTime - lastTime;
      frameTimes.push(frameTime);
      lastTime = currentTime;
      frameCount++;
      
      if (frameCount < 60) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
    
    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const droppedFrames = frameTimes.filter(t => t > FRAME_BUDGET_MS).length;
    const fps = 1000 / avgFrameTime;
    
    console.log(`Animation stats: avg frame time=${avgFrameTime.toFixed(2)}ms, fps=${fps.toFixed(1)}, dropped frames=${droppedFrames}`);
    
    // Allow up to 10% dropped frames
    expect(droppedFrames).toBeLessThan(6);
    expect(fps).toBeGreaterThan(55);
  });
});
