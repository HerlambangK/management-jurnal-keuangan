export interface ModalProps {
  message: string;
  title?: string;
  type?: "information" | "danger" | "success" | "warning";
  onOk?: () => void;
  onCancel?: () => void;
  okText?: string;
  cancelText?: string;
  closeOnBackdrop?: boolean;
  isLoading?: boolean;
}
