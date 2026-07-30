export interface Notification {
  id: number
  user_id: number
  shipment_id: number
  message: string
  read: boolean
  created_at: string
}
