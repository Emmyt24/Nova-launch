import { useToast } from '../hooks/useToast';

/**
 * Toast System Usage Examples
 * 
 * This file demonstrates all features of the enhanced toast notification system.
 */

// ============================================================================
// BASIC USAGE
// ============================================================================

export function BasicToastExample() {
  const { success, error, info, warning } = useToast();

  return (
    <div className="space-y-2">
      <button onClick={() => success('Operation successful!')}>
        Success Toast
      </button>
      <button onClick={() => error('Something went wrong')}>
        Error Toast
      </button>
      <button onClick={() => info('Here is some information')}>
        Info Toast
      </button>
      <button onClick={() => warning('Please be careful')}>
        Warning Toast
      </button>
    </div>
  );
}

// ============================================================================
// ACTION BUTTONS
// ============================================================================

export function ActionButtonExample() {
  const { showToast } = useToast();

  const deleteItem = () => {
    // Simulate delete
    console.log('Item deleted');

    showToast('Item deleted', 'success', {
      action: {
        label: 'Undo',
        onClick: () => {
          console.log('Item restored');
        },
      },
    });
  };

  const retryUpload = () => {
    showToast('Upload failed', 'error', {
      duration: 7000,
      action: {
        label: 'Retry',
        onClick: () => {
          console.log('Retrying upload...');
        },
      },
    });
  };

  return (
    <div className="space-y-2">
      <button onClick={deleteItem}>Delete with Undo</button>
      <button onClick={retryUpload}>Failed Upload with Retry</button>
    </div>
  );
}

// ============================================================================
// CUSTOM DURATION
// ============================================================================

export function CustomDurationExample() {
  const { success, info } = useToast();

  return (
    <div className="space-y-2">
      <button onClick={() => success('Quick message', { duration: 2000 })}>
        2 Second Toast
      </button>
      <button onClick={() => info('Long message', { duration: 10000 })}>
        10 Second Toast
      </button>
      <button onClick={() => info('Persistent', { duration: 0 })}>
        Persistent Toast (Manual Dismiss)
      </button>
    </div>
  );
}

// ============================================================================
// PROGRESS BAR
// ============================================================================

export function ProgressBarExample() {
  const { showToast } = useToast();

  return (
    <div className="space-y-2">
      <button
        onClick={() =>
          showToast('With progress', 'info', { showProgress: true })
        }
      >
        Show Progress Bar
      </button>
      <button
        onClick={() =>
          showToast('No progress', 'info', { showProgress: false })
        }
      >
        Hide Progress Bar
      </button>
    </div>
  );
}

// ============================================================================
// DISMISS ALL
// ============================================================================

export function DismissAllExample() {
  const { success, error, info, clearToasts } = useToast();

  const showMultiple = () => {
    success('First toast');
    setTimeout(() => error('Second toast'), 100);
    setTimeout(() => info('Third toast'), 200);
  };

  return (
    <div className="space-y-2">
      <button onClick={showMultiple}>Show Multiple Toasts</button>
      <button onClick={clearToasts}>Dismiss All</button>
    </div>
  );
}

// ============================================================================
// REAL-WORLD EXAMPLES
// ============================================================================

// File Upload Example
export function FileUploadExample() {
  const { showToast, hideToast, success, error } = useToast();

  const uploadFile = async (file: File) => {
    const toastId = showToast('Uploading file...', 'info', {
      duration: 0,
      showProgress: false,
    });

    try {
      // Simulate upload
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      hideToast(toastId);
      success('File uploaded successfully!');
    } catch (err) {
      hideToast(toastId);
      error('Upload failed', {
        action: {
          label: 'Retry',
          onClick: () => uploadFile(file),
        },
      });
    }
  };

  return (
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) uploadFile(file);
      }}
    />
  );
}

// Form Submission Example
export function FormSubmissionExample() {
  const { success, error } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));
      success('Form submitted successfully!');
    } catch (err) {
      error('Failed to submit form', { duration: 7000 });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" placeholder="Name" />
      <button type="submit">Submit</button>
    </form>
  );
}

// Copy to Clipboard Example
export function CopyToClipboardExample() {
  const { success } = useToast();

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      success('Copied to clipboard!', { duration: 2000 });
    } catch (err) {
      // Fallback handled elsewhere
    }
  };

  return (
    <button onClick={() => copyText('Hello World')}>
      Copy Text
    </button>
  );
}

// Network Status Example
export function NetworkStatusExample() {
  const { warning, success } = useToast();

  React.useEffect(() => {
    const handleOffline = () => {
      warning('You are offline. Changes will sync when reconnected.', {
        duration: 0,
      });
    };

    const handleOnline = () => {
      success('Back online! Syncing changes...');
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [warning, success]);

  return null;
}

// Todo List with Undo Example
export function TodoListExample() {
  const [todos, setTodos] = React.useState([
    { id: '1', text: 'Buy groceries' },
    { id: '2', text: 'Walk the dog' },
  ]);
  const { showToast } = useToast();

  const deleteTodo = (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    setTodos(todos.filter((t) => t.id !== id));

    showToast('Todo deleted', 'success', {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          setTodos((current) => [...current, todo]);
        },
      },
    });
  };

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>
          {todo.text}
          <button onClick={() => deleteTodo(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}

// Settings Save Example
export function SettingsSaveExample() {
  const { success, error } = useToast();

  const saveSettings = async (settings: Record<string, unknown>) => {
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      success('Settings saved', { duration: 3000 });
    } catch (err) {
      error('Failed to save settings', {
        action: {
          label: 'Retry',
          onClick: () => saveSettings(settings),
        },
      });
    }
  };

  return (
    <button onClick={() => saveSettings({ theme: 'dark' })}>
      Save Settings
    </button>
  );
}

// Batch Operations Example
export function BatchOperationsExample() {
  const { success, info } = useToast();

  const processBatch = async (items: string[]) => {
    info(`Processing ${items.length} items...`, {
      duration: 0,
      showProgress: false,
    });

    // Simulate processing
    await new Promise((resolve) => setTimeout(resolve, 3000));

    success(`Successfully processed ${items.length} items!`);
  };

  return (
    <button onClick={() => processBatch(['item1', 'item2', 'item3'])}>
      Process Batch
    </button>
  );
}

// ============================================================================
// DEMO COMPONENT
// ============================================================================

export function ToastDemo() {
  return (
    <div className="p-8 space-y-8">
      <section>
        <h2 className="text-xl font-bold mb-4">Basic Toasts</h2>
        <BasicToastExample />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Action Buttons</h2>
        <ActionButtonExample />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Custom Duration</h2>
        <CustomDurationExample />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Progress Bar</h2>
        <ProgressBarExample />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Dismiss All</h2>
        <DismissAllExample />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">Real-World Examples</h2>
        <div className="space-y-4">
          <FileUploadExample />
          <FormSubmissionExample />
          <CopyToClipboardExample />
          <TodoListExample />
          <SettingsSaveExample />
          <BatchOperationsExample />
        </div>
      </section>
    </div>
  );
}

// Add React import at the top
import React from 'react';
