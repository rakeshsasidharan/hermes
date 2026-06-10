import { render, screen } from '@testing-library/react';
import { useSelector, useDispatch } from 'react-redux';
import { StoreProvider } from '@/components/store-provider';
import { RootState } from '@/store';

function TestConsumer() {
  const dispatch = useDispatch();
  const apiState = useSelector((state: RootState) => state.api);
  return (
    <div>
      <span data-testid="dispatch-type">{typeof dispatch}</span>
      <span data-testid="api-defined">{apiState !== undefined ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('StoreProvider', () => {
  it('provides the Redux store to children', () => {
    render(
      <StoreProvider>
        <TestConsumer />
      </StoreProvider>
    );

    expect(screen.getByTestId('dispatch-type').textContent).toBe('function');
    expect(screen.getByTestId('api-defined').textContent).toBe('yes');
  });

  it('renders children', () => {
    render(
      <StoreProvider>
        <span data-testid="child">hello</span>
      </StoreProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
