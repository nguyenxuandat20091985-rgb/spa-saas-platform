import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/utils/formatters.dart';

class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key});

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  DateTime _selectedDate = DateTime.now();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Booking', style: GoogleFonts.playfairDisplay()),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_view_day),
            onPressed: () {},
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: 'Lịch hẹn'),
            Tab(text: 'Lịch KTV'),
            Tab(text: 'Phòng'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _AppointmentListTab(selectedDate: _selectedDate, onDateChanged: (d) => setState(() => _selectedDate = d)),
          const _StaffScheduleTab(),
          const _RoomScheduleTab(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateBookingDialog(context),
        icon: const Icon(Icons.add),
        label: const Text('Đặt lịch'),
      ),
    );
  }

  void _showCreateBookingDialog(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => const _CreateBookingSheet(),
    );
  }
}

class _AppointmentListTab extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateChanged;

  const _AppointmentListTab({required this.selectedDate, required this.onDateChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Date Selector
        SizedBox(
          height: 80,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: 14,
            itemBuilder: (ctx, i) {
              final date = DateTime.now().add(Duration(days: i - 3));
              final isSelected = date.day == selectedDate.day && date.month == selectedDate.month;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: InkWell(
                  onTap: () => onDateChanged(date),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    width: 52,
                    decoration: BoxDecoration(
                      color: isSelected ? AppColors.primary : AppColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: isSelected ? AppColors.primary : AppColors.divider),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          _weekday(date.weekday),
                          style: TextStyle(
                            fontSize: 11,
                            color: isSelected ? Colors.white70 : AppColors.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${date.day}',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: isSelected ? Colors.white : AppColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        // Summary
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Text(
                AppFormatters.date(selectedDate),
                style: GoogleFonts.inter(fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              const _StatusChip(label: 'Chờ: 0', color: AppColors.warning),
              const SizedBox(width: 4),
              const _StatusChip(label: 'Xong: 0', color: AppColors.success),
            ],
          ),
        ),
        const SizedBox(height: 8),
        const Expanded(
          child: EmptyStateWidget(
            icon: Icons.calendar_today,
            title: 'Chưa có lịch hẹn',
            message: 'Tạo lịch hẹn mới cho khách hàng',
          ),
        ),
      ],
    );
  }

  String _weekday(int day) {
    const days = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    return days[day];
  }
}

class _StaffScheduleTab extends StatelessWidget {
  const _StaffScheduleTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.person_pin_circle,
      title: 'Lịch kỹ thuật viên',
      message: 'Quản lý lịch làm việc của nhân viên',
    );
  }
}

class _RoomScheduleTab extends StatelessWidget {
  const _RoomScheduleTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.meeting_room,
      title: 'Lịch phòng',
      message: 'Quản lý sử dụng phòng và thiết bị',
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500)),
    );
  }
}

class _CreateBookingSheet extends StatefulWidget {
  const _CreateBookingSheet();

  @override
  State<_CreateBookingSheet> createState() => _CreateBookingSheetState();
}

class _CreateBookingSheetState extends State<_CreateBookingSheet> {
  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Padding(
          padding: const EdgeInsets.all(24),
          child: ListView(
            controller: scrollController,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(color: AppColors.divider, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 24),
              Text('Đặt lịch mới', style: GoogleFonts.playfairDisplay(fontSize: 22, fontWeight: FontWeight.bold)),
              const SizedBox(height: 24),
              const TextField(decoration: InputDecoration(labelText: 'Chọn khách hàng', prefixIcon: Icon(Icons.person_search))),
              const SizedBox(height: 16),
              const TextField(decoration: InputDecoration(labelText: 'Chọn dịch vụ', prefixIcon: Icon(Icons.spa))),
              const SizedBox(height: 16),
              const TextField(decoration: InputDecoration(labelText: 'Chọn kỹ thuật viên', prefixIcon: Icon(Icons.person))),
              const SizedBox(height: 16),
              const TextField(decoration: InputDecoration(labelText: 'Chọn chi nhánh', prefixIcon: Icon(Icons.business))),
              const SizedBox(height: 16),
              const TextField(decoration: InputDecoration(labelText: 'Ngày', prefixIcon: Icon(Icons.calendar_today))),
              const SizedBox(height: 16),
              const TextField(decoration: InputDecoration(labelText: 'Giờ', prefixIcon: Icon(Icons.access_time))),
              const SizedBox(height: 16),
              const TextField(
                decoration: InputDecoration(labelText: 'Ghi chú', prefixIcon: Icon(Icons.note)),
                maxLines: 3,
              ),
              const SizedBox(height: 24),
              ElevatedButton(onPressed: () => Navigator.pop(context), child: const Text('Xác nhận đặt lịch')),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }
}
