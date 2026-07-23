import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import '../../bloc/booking/booking_bloc.dart';
import '../../bloc/booking/booking_event.dart';
import '../../bloc/booking/booking_state.dart';
import '../../widgets/booking_card.dart';
import '../../widgets/date_selector.dart';
import '../../widgets/status_chip.dart';
import '../../widgets/create_booking_sheet.dart';

class BookingScreen extends StatefulWidget {
  const BookingScreen({super.key});

  @override
  State<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends State<BookingScreen>
    with SingleTickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  late TabController _tabController;
  DateTime _selectedDate = DateTime.now();

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _loadData() {
    context.read<BookingBloc>().add(LoadBookingsEvent(
      date: _selectedDate,
    ));
    context.read<BookingBloc>().add(const LoadStaffSchedulesEvent());
    context.read<BookingBloc>().add(const LoadRoomSchedulesEvent());
  }

  void _onDateChanged(DateTime date) {
    setState(() {
      _selectedDate = date;
    });
    context.read<BookingBloc>().add(LoadBookingsEvent(date: date));
  }

  void _showCreateBookingDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => BlocProvider.value(
        value: context.read<BookingBloc>(),
        child: const CreateBookingSheet(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Booking',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_view_day),
            onPressed: () => _switchView(),
          ),
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilterDialog(),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          indicatorWeight: 3,
          labelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
          unselectedLabelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.normal,
            fontSize: 14,
          ),
          tabs: const [
            Tab(text: 'Lịch hẹn'),
            Tab(text: 'Lịch KTV'),
            Tab(text: 'Phòng'),
          ],
        ),
      ),
      body: BlocConsumer<BookingBloc, BookingState>(
        listener: (context, state) {
          if (state is BookingError) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.message),
                backgroundColor: Colors.red,
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
          if (state is BookingCreated) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Đặt lịch thành công!'),
                backgroundColor: AppColors.success,
                behavior: SnackBarBehavior.floating,
              ),
            );
            _loadData();
          }
        },
        builder: (context, state) {
          if (state is BookingLoading && state.isInitial) {
            return const Center(
              child: LoadingWidget(
                message: 'Đang tải dữ liệu...',
              ),
            );
          }

          return TabBarView(
            controller: _tabController,
            children: [
              _AppointmentListTab(
                selectedDate: _selectedDate,
                onDateChanged: _onDateChanged,
                state: state,
              ),
              const _StaffScheduleTab(),
              const _RoomScheduleTab(),
            ],
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _showCreateBookingDialog,
        icon: const Icon(Icons.add),
        label: const Text('Đặt lịch'),
        backgroundColor: AppColors.primary,
      ),
    );
  }

  void _switchView() {
    // Toggle between day/week/month view
  }

  void _showFilterDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Lọc lịch hẹn'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Chọn trạng thái:'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                _FilterChip(label: 'Tất cả', isSelected: true),
                _FilterChip(label: 'Chờ xác nhận', isSelected: false),
                _FilterChip(label: 'Xác nhận', isSelected: false),
                _FilterChip(label: 'Đang thực hiện', isSelected: false),
                _FilterChip(label: 'Hoàn thành', isSelected: false),
                _FilterChip(label: 'Đã hủy', isSelected: false),
              ],
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đóng'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Áp dụng'),
          ),
        ],
      ),
    );
  }
}

// ==========================================
// FILTER CHIP
// ==========================================
class _FilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;

  const _FilterChip({required this.label, required this.isSelected});

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) {},
      backgroundColor: AppColors.surface,
      selectedColor: AppColors.primary.withOpacity(0.1),
      checkmarkColor: AppColors.primary,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.primary : AppColors.textSecondary,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
      ),
    );
  }
}

// ==========================================
// APPOINTMENT LIST TAB
// ==========================================
class _AppointmentListTab extends StatelessWidget {
  final DateTime selectedDate;
  final ValueChanged<DateTime> onDateChanged;
  final BookingState state;

  const _AppointmentListTab({
    required this.selectedDate,
    required this.onDateChanged,
    required this.state,
  });

  @override
  Widget build(BuildContext context) {
    final bookings = state is BookingsLoaded ? state.bookings : <dynamic>[];
    final pendingCount = bookings.where((b) => b.status == 'pending' || b.status == 'confirmed').length;
    final completedCount = bookings.where((b) => b.status == 'completed').length;

    return Column(
      children: [
        // Date Selector
        DateSelector(
          selectedDate: selectedDate,
          onDateChanged: onDateChanged,
        ),
        const SizedBox(height: 8),

        // Summary
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Text(
                DateFormat('EEEE, dd/MM/yyyy', 'vi').format(selectedDate),
                style: GoogleFonts.inter(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              StatusChip(
                label: 'Chờ: $pendingCount',
                color: AppColors.warning,
              ),
              const SizedBox(width: 4),
              StatusChip(
                label: 'Xong: $completedCount',
                color: AppColors.success,
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),

        // Booking List
        Expanded(
          child: state is BookingLoading && state.isInitial
              ? const Center(child: CircularProgressIndicator())
              : bookings.isEmpty
                  ? const EmptyStateWidget(
                      icon: Icons.calendar_today,
                      title: 'Chưa có lịch hẹn',
                      message: 'Tạo lịch hẹn mới cho khách hàng',
                      actionLabel: 'Đặt lịch ngay',
                      onAction: _navigateToCreateBooking,
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      itemCount: bookings.length,
                      itemBuilder: (ctx, index) {
                        final booking = bookings[index];
                        return BookingCard(
                          booking: booking,
                          onTap: () => _navigateToBookingDetail(context, booking.id),
                          onStatusChange: (newStatus) {
                            context.read<BookingBloc>().add(
                              UpdateBookingStatusEvent(
                                bookingId: booking.id,
                                status: newStatus,
                              ),
                            );
                          },
                        );
                      },
                    ),
        ),
      ],
    );
  }

  void _navigateToCreateBooking(BuildContext context) {
    // Switch to create booking
    final bookingScreen = context.findAncestorStateOfType<_BookingScreenState>();
    if (bookingScreen != null) {
      bookingScreen._showCreateBookingDialog();
    }
  }

  void _navigateToBookingDetail(BuildContext context, String bookingId) {
    Navigator.pushNamed(context, '/booking-detail', arguments: bookingId);
  }
}

// ==========================================
// STAFF SCHEDULE TAB
// ==========================================
class _StaffScheduleTab extends StatelessWidget {
  const _StaffScheduleTab();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BookingBloc, BookingState>(
      builder: (context, state) {
        if (state is BookingLoading && state.isInitial) {
          return const Center(child: CircularProgressIndicator());
        }

        final staff = state is StaffSchedulesLoaded ? state.staff : <dynamic>[];

        if (staff.isEmpty) {
          return const EmptyStateWidget(
            icon: Icons.person_pin_circle,
            title: 'Lịch kỹ thuật viên',
            message: 'Quản lý lịch làm việc của nhân viên',
            actionLabel: 'Thêm lịch',
            onAction: _navigateToAddSchedule,
          );
        }

        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: staff.length,
          itemBuilder: (context, index) {
            final member = staff[index];
            return _StaffScheduleCard(staff: member);
          },
        );
      },
    );
  }

  static void _navigateToAddSchedule(BuildContext context) {
    // Navigate to add schedule
  }
}

// ==========================================
// STAFF SCHEDULE CARD
// ==========================================
class _StaffScheduleCard extends StatelessWidget {
  final dynamic staff;

  const _StaffScheduleCard({required this.staff});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: AppColors.primary.withOpacity(0.1),
            child: Text(
              staff.name[0],
              style: const TextStyle(color: AppColors.primary),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  staff.name,
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: (staff.schedule ?? []).map<Widget>((day) {
                    return Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: day.isAvailable
                            ? AppColors.success.withOpacity(0.1)
                            : AppColors.error.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        day.day,
                        style: TextStyle(
                          fontSize: 10,
                          color: day.isAvailable ? AppColors.success : AppColors.error,
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.edit_outlined, size: 18),
            onPressed: () {},
          ),
        ],
      ),
    );
  }
}

// ==========================================
// ROOM SCHEDULE TAB
// ==========================================
class _RoomScheduleTab extends StatelessWidget {
  const _RoomScheduleTab();

  @override
  Widget build(BuildContext context) {
    return const EmptyStateWidget(
      icon: Icons.meeting_room,
      title: 'Lịch phòng',
      message: 'Quản lý sử dụng phòng và thiết bị',
      actionLabel: 'Thêm phòng',
      onAction: _navigateToAddRoom,
    );
  }

  static void _navigateToAddRoom(BuildContext context) {
    // Navigate to add room
  }
}